using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Lookup;
using YnabCategoryAi.ML.Llm;

namespace YnabCategoryAi.ML;

public sealed class CategorizationPipeline
{
    private readonly MlSettings _settings;
    private readonly CategoryCatalog _catalog;
    private readonly PayeeLookup _payeeLookup = new();
    private readonly PayeeClusterIndex _payeeClusterIndex = new();
    private readonly CategoryLookup _categoryLookup = new();
    private readonly ClassificationExclusionMatcher _exclusionMatcher;
    private readonly PayeeMappingModel _payeeModel;
    private readonly GroupClassificationModel _groupModel;
    private readonly CategoryClassificationModel _categoryModel;
    private readonly HierarchicalClassificationModel _hierarchicalModel;
    private readonly ILlmCategorizationService _llmService;
    private readonly AmbiguousMerchantIndex _ambiguousIndex = new();

    public CategorizationPipeline(
        MlSettings settings,
        CategoryCatalog catalog,
        ClassificationExclusionMatcher exclusionMatcher,
        PayeeMappingModel payeeModel,
        GroupClassificationModel groupModel,
        CategoryClassificationModel categoryModel,
        ILlmCategorizationService llmService)
    {
        _settings = settings;
        _catalog = catalog;
        _exclusionMatcher = exclusionMatcher;
        _payeeModel = payeeModel;
        _groupModel = groupModel;
        _categoryModel = categoryModel;
        _hierarchicalModel = new HierarchicalClassificationModel(groupModel, categoryModel, catalog);
        _llmService = llmService;
    }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, bool forceRetrain = false)
    {
        DateOnly referenceDate = transactions.Max(t => t.Date);

        _catalog.IndexTrainingData(transactions);
        _ambiguousIndex.Train(transactions, _settings.Ambiguity, referenceDate);

        IReadOnlyList<TrainingTransaction> unambiguous = transactions
            .Where(t => !_ambiguousIndex.IsAmbiguous(t))
            .ToList();

        List<WeightedPayeeImport> augmentedImports = PayeeTrainingDataBuilder.BuildWeightedAugmentedImports(
            unambiguous,
            referenceDate,
            _settings.Ambiguity,
            _settings.PayeeResolution);

        _payeeLookup.Train(unambiguous, referenceDate, _settings.Ambiguity, augmentedImports);
        _payeeClusterIndex.Train(unambiguous, augmentedImports);
        _categoryLookup.Train(transactions, _ambiguousIndex, referenceDate, _settings.Ambiguity);
        _payeeModel.Train(unambiguous, forceRetrain);
        _hierarchicalModel.Train(unambiguous, forceRetrain);
        _payeeModel.Load();
        _hierarchicalModel.Load();
    }

    public AmbiguousMerchantIndex AmbiguousIndex => _ambiguousIndex;

    public PayeeClusterIndex PayeeClusterIndex => _payeeClusterIndex;

    public async Task<CategorizationResult> PredictAsync(
        PendingTransaction transaction,
        bool useLlm,
        CancellationToken cancellationToken = default) =>
        (await PredictDetailedAsync(transaction, useLlm, cancellationToken)).ToResult();

    public async Task<CategorizationProposal> PredictDetailedAsync(
        PendingTransaction transaction,
        bool useLlm,
        CancellationToken cancellationToken = default)
    {
        string featureText = BuildFeatureText(
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName,
            transaction.PayeeName,
            transaction.Memo);

        if (_exclusionMatcher.TryGetExclusion(
                transaction.ImportPayeeNameOriginal,
                transaction.ImportPayeeName,
                transaction.PayeeName,
                transaction.Memo,
                out ExclusionKind exclusionKind))
        {
            return CategorizationProposalBuilder.BuildExcluded(transaction, featureText, exclusionKind);
        }

        bool isNovelImport = !_catalog.HasSeenImportString(transaction.ImportPayeeNameOriginal);
        bool isAmbiguous = _ambiguousIndex.IsAmbiguous(transaction);

        List<MethodSignal> signals = CollectMethodSignals(transaction, _settings.OptionConfidenceFloor);

        bool gotConsensus = AgreementAnalysis.TryGetStrictConsensus(
            signals,
            _settings.Consensus,
            out string? consensusCategory,
            out IReadOnlyList<MethodSignal> agreeing,
            out float consensusConfidence);

        if (gotConsensus && !isAmbiguous)
        {
            return CategorizationProposalBuilder.BuildFromPipelineState(
                transaction,
                featureText,
                signals,
                isAmbiguous,
                isNovelImport,
                _settings,
                _catalog,
                gotConsensus: true,
                consensusCategory,
                agreeing,
                consensusConfidence,
                llmResult: null);
        }

        CategorizationResult? llmResult = null;
        if (useLlm && _llmService.IsAvailable)
        {
            CategorizationRouteReason routeReason = isAmbiguous
                ? CategorizationRouteReason.AmbiguousMerchant
                : isNovelImport
                    ? CategorizationRouteReason.NovelImportString
                    : CategorizationRouteReason.LowConfidence;

            llmResult = await TryLlmPredictionAsync(
                transaction,
                featureText,
                routeReason,
                cancellationToken);
        }

        return CategorizationProposalBuilder.BuildFromPipelineState(
            transaction,
            featureText,
            signals,
            isAmbiguous,
            isNovelImport,
            _settings,
            _catalog,
            gotConsensus,
            consensusCategory,
            agreeing,
            consensusConfidence,
            llmResult);
    }

    public async Task<IReadOnlyList<CategorizationProposal>> PredictPendingDetailedAsync(
        IReadOnlyList<PendingTransaction> transactions,
        bool useLlm,
        CancellationToken cancellationToken = default)
    {
        var proposals = new List<CategorizationProposal>(transactions.Count);

        foreach (PendingTransaction transaction in transactions)
        {
            proposals.Add(await PredictDetailedAsync(transaction, useLlm, cancellationToken));
        }

        return proposals;
    }

    public CategorizationProposalQueueSummary SummarizeQueue(IEnumerable<CategorizationProposal> proposals) =>
        CategorizationProposalQueueSummary.From(proposals);

    public async Task<IReadOnlyList<(CategorizationResult Result, bool Correct)>> EvaluateLabeledAsync(
        IReadOnlyList<TrainingTransaction> evaluationSet,
        bool useLlm,
        CancellationToken cancellationToken = default)
    {
        var labeled = new List<(CategorizationResult, bool)>(evaluationSet.Count);

        foreach (TrainingTransaction t in evaluationSet)
        {
            CategorizationResult result = await PredictAsync(ToPending(t), useLlm, cancellationToken);
            bool isCorrect = CategoryNormalizer.AreEquivalent(result.PredictedCategory, t.CategoryName);
            labeled.Add((result, isCorrect));
        }

        return labeled;
    }

    public IReadOnlyList<(CategorizationResult Result, bool Correct)> EvaluateLabeled(
        IReadOnlyList<TrainingTransaction> evaluationSet) =>
        EvaluateLabeledAsync(evaluationSet, useLlm: false).GetAwaiter().GetResult();

    private static PendingTransaction ToPending(TrainingTransaction transaction) =>
        new(
            transaction.Id,
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName,
            transaction.PayeeName,
            transaction.PayeeId,
            transaction.Amount,
            transaction.AccountName,
            transaction.Memo,
            transaction.Date);

    public CategorizationResult PredictForEvaluation(TrainingTransaction transaction) =>
        PredictAsync(ToPending(transaction), useLlm: false).GetAwaiter().GetResult();

    public PayeeResolutionResult ResolvePayee(PendingTransaction transaction)
    {
        string featureText = BuildFeatureText(
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName,
            transaction.PayeeName,
            transaction.Memo);

        if (_payeeLookup.TryResolve(
                transaction.ImportPayeeNameOriginal,
                transaction.ImportPayeeName,
                minVoteShare: 0f,
                out LookupPrediction exact,
                out _))
        {
            return new PayeeResolutionResult(
                PayeeResolutionMethod.ExactLookup,
                exact.Label,
                exact.Confidence);
        }

        if (_payeeClusterIndex.TryResolve(
                transaction.ImportPayeeNameOriginal,
                transaction.ImportPayeeName,
                _settings.PayeeResolution,
                _ambiguousIndex,
                out LookupPrediction cluster))
        {
            return new PayeeResolutionResult(
                PayeeResolutionMethod.ClusterLookup,
                cluster.Label,
                cluster.Confidence);
        }

        if (_payeeModel.TryPredict(
                featureText,
                confidenceThreshold: 0f,
                out string modeledPayee,
                out float payeeConfidence))
        {
            return new PayeeResolutionResult(
                PayeeResolutionMethod.Model,
                modeledPayee,
                payeeConfidence);
        }

        return new PayeeResolutionResult(PayeeResolutionMethod.Unresolved, null, 0f);
    }

    public PayeeResolutionMetrics EvaluatePayeeResolution(IReadOnlyList<TrainingTransaction> evaluationSet)
    {
        int correct = 0;
        int exact = 0;
        int cluster = 0;
        int model = 0;
        int unresolved = 0;
        int novelImports = 0;
        int novelClusterResolved = 0;
        int novelModelResolved = 0;

        foreach (TrainingTransaction t in evaluationSet)
        {
            if (string.IsNullOrWhiteSpace(t.PayeeName))
                continue;

            PendingTransaction pending = ToPending(t);
            PayeeResolutionResult resolution = ResolvePayee(pending);
            bool isNovel = !_catalog.HasSeenImportString(t.ImportPayeeNameOriginal);

            if (isNovel)
                novelImports++;

            switch (resolution.Method)
            {
                case PayeeResolutionMethod.ExactLookup:
                    exact++;
                    break;
                case PayeeResolutionMethod.ClusterLookup:
                    cluster++;
                    if (isNovel)
                        novelClusterResolved++;
                    break;
                case PayeeResolutionMethod.Model:
                    model++;
                    if (isNovel)
                        novelModelResolved++;
                    break;
                default:
                    unresolved++;
                    break;
            }

            if (resolution.ResolvedPayee != null
                && string.Equals(
                    resolution.ResolvedPayee,
                    t.PayeeName,
                    StringComparison.OrdinalIgnoreCase))
            {
                correct++;
            }
        }

        int total = evaluationSet.Count(t => !string.IsNullOrWhiteSpace(t.PayeeName));

        return new PayeeResolutionMetrics
        {
            Total = total,
            Correct = correct,
            ExactLookup = exact,
            ClusterLookup = cluster,
            Model = model,
            Unresolved = unresolved,
            NovelImports = novelImports,
            NovelClusterResolved = novelClusterResolved,
            NovelModelResolved = novelModelResolved
        };
    }

    public EvaluationMetrics Evaluate(IReadOnlyList<TrainingTransaction> evaluationSet)
    {
        int correct = 0;
        int reliable = 0;
        int reliableCorrect = 0;
        var methodCounts = new Dictionary<CategorizationMethod, int>();
        var methodAccuracy = new Dictionary<CategorizationMethod, (int Correct, int Total)>();

        foreach (TrainingTransaction t in evaluationSet)
        {
            CategorizationResult result = PredictForEvaluation(t);
            methodCounts[result.Method] = methodCounts.GetValueOrDefault(result.Method) + 1;

            bool isCorrect = CategoryNormalizer.AreEquivalent(result.PredictedCategory, t.CategoryName);

            if (result.Method is not (CategorizationMethod.None or CategorizationMethod.ManualReview))
            {
                (int Correct, int Total) stats = methodAccuracy.GetValueOrDefault(result.Method);
                methodAccuracy[result.Method] = (stats.Correct + (isCorrect ? 1 : 0), stats.Total + 1);
            }

            if (isCorrect)
                correct++;

            if (result.IsReliable)
            {
                reliable++;
                if (isCorrect)
                    reliableCorrect++;
            }
        }

        return new EvaluationMetrics
        {
            Total = evaluationSet.Count,
            Correct = correct,
            Reliable = reliable,
            ReliableCorrect = reliableCorrect,
            MethodCounts = methodCounts,
            MethodAccuracy = methodAccuracy
        };
    }

    public IReadOnlyList<SignalRow> CollectSignalRows(IReadOnlyList<TrainingTransaction> evaluationSet)
    {
        var rows = new List<SignalRow>(evaluationSet.Count);

        foreach (TrainingTransaction t in evaluationSet)
        {
            var pending = new PendingTransaction(
                t.Id,
                t.ImportPayeeNameOriginal,
                t.ImportPayeeName,
                t.PayeeName,
                t.PayeeId,
                t.Amount,
                t.AccountName,
                t.Memo,
                t.Date);

            bool excluded = _exclusionMatcher.TryGetExclusion(
                pending.ImportPayeeNameOriginal,
                pending.ImportPayeeName,
                pending.PayeeName,
                pending.Memo,
                out _);

            rows.Add(new SignalRow(
                t,
                excluded ? [] : CollectMethodSignals(pending),
                excluded));
        }

        return rows;
    }

    public IReadOnlyList<(IReadOnlyList<MethodSignal> Signals, string ActualCategory, bool IsExcluded)> CollectSignals(
        IReadOnlyList<TrainingTransaction> evaluationSet) =>
        CollectSignalRows(evaluationSet)
            .Select(r => (r.Signals, r.Transaction.CategoryName, r.IsExcluded))
            .ToList();

    private List<MethodSignal> CollectMethodSignals(PendingTransaction transaction) =>
        CollectMethodSignals(transaction, _settings.OptionConfidenceFloor);

    private List<MethodSignal> CollectMethodSignals(PendingTransaction transaction, float minConfidence)
    {
        string featureText = BuildFeatureText(
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName,
            transaction.PayeeName,
            transaction.Memo);

        var signals = new List<MethodSignal>();

        if (_categoryLookup.TryPredictByImportAndAmount(
                transaction.ImportPayeeNameOriginal,
                transaction.Amount,
                minConfidence,
                out LookupPrediction byImportAmount))
        {
            signals.Add(new(CategorizationMethod.ImportAmountLookup, byImportAmount.Label, byImportAmount.Confidence));
        }

        if (_categoryLookup.TryPredictByImportOriginal(
                transaction.ImportPayeeNameOriginal,
                minConfidence,
                out LookupPrediction byImport))
        {
            signals.Add(new(CategorizationMethod.ImportLookup, byImport.Label, byImport.Confidence));
        }

        if (_categoryLookup.TryPredictByPayeeId(
                transaction.PayeeId,
                minConfidence,
                _settings.AmbiguousPayeeVoteShareThreshold,
                out LookupPrediction byPayeeId))
        {
            signals.Add(new(CategorizationMethod.PayeeIdLookup, byPayeeId.Label, byPayeeId.Confidence));
        }

        if (_hierarchicalModel.TryPredict(
                featureText,
                transaction.Amount,
                transaction.AccountName,
                minConfidence,
                out string hierarchicalCategory,
                out _,
                out float hierarchicalConfidence))
        {
            signals.Add(new(CategorizationMethod.HierarchicalModel, hierarchicalCategory, hierarchicalConfidence));
        }

        if (_categoryModel.TryPredict(
                featureText,
                transaction.Amount,
                transaction.AccountName,
                minConfidence,
                out string flatCategory,
                out float flatConfidence)
            && _catalog.IsLocallyTrainable(flatCategory))
        {
            signals.Add(new(CategorizationMethod.CategoryModel, flatCategory, flatConfidence));
        }

        if (_payeeLookup.TryResolve(
                transaction.ImportPayeeNameOriginal,
                transaction.ImportPayeeName,
                minConfidence,
                out LookupPrediction payeeLookup,
                out _)
            && _categoryLookup.TryPredictByCanonicalPayee(
                payeeLookup.Label,
                minConfidence,
                out LookupPrediction byCanonical))
        {
            signals.Add(new(
                CategorizationMethod.CanonicalPayeeLookup,
                byCanonical.Label,
                Math.Min(payeeLookup.Confidence, byCanonical.Confidence)));
        }
        else if (_payeeClusterIndex.TryResolve(
                     transaction.ImportPayeeNameOriginal,
                     transaction.ImportPayeeName,
                     _settings.PayeeResolution,
                     _ambiguousIndex,
                     out LookupPrediction clusterPayee)
                 && _categoryLookup.TryPredictByCanonicalPayee(
                     clusterPayee.Label,
                     minConfidence,
                     out LookupPrediction byClusterPayee))
        {
            signals.Add(new(
                CategorizationMethod.PayeeClusterLookup,
                byClusterPayee.Label,
                Math.Min(clusterPayee.Confidence, byClusterPayee.Confidence)));
        }

        if (_payeeModel.TryPredict(
                featureText,
                minConfidence,
                out string modeledPayee,
                out float payeeConfidence)
            && _categoryLookup.TryPredictByCanonicalPayee(
                modeledPayee,
                minConfidence,
                out LookupPrediction byModeledPayee))
        {
            signals.Add(new(
                CategorizationMethod.PayeeModel,
                byModeledPayee.Label,
                Math.Min(payeeConfidence, byModeledPayee.Confidence)));
        }

        return signals;
    }

    private async Task<CategorizationResult?> TryLlmPredictionAsync(
        PendingTransaction transaction,
        string featureText,
        CategorizationRouteReason routeReason,
        CancellationToken cancellationToken)
    {
        string? suggestedGroup = null;
        if (_groupModel.TryPredict(
                featureText,
                transaction.Amount,
                transaction.AccountName,
                confidenceThreshold: 0.5f,
                out string group,
                out _))
        {
            suggestedGroup = group;
        }

        IReadOnlyList<CategoryInfo> candidates = BuildLlmCandidates(suggestedGroup);

        LlmCategorizationResponse? response = await _llmService.CategorizeAsync(
            new LlmCategorizationRequest
            {
                FeatureText = featureText,
                AmountDollars = Math.Abs(transaction.Amount) / 1000m,
                AccountName = transaction.AccountName,
                Memo = transaction.Memo,
                CandidateCategories = candidates,
                SuggestedGroupName = suggestedGroup,
                RoutingReason = MapLlmRoutingReason(routeReason)
            },
            cancellationToken);

        if (response?.CategoryName == null)
            return null;

        if (!_catalog.TryResolveCategory(response.CategoryName, out CategoryInfo categoryInfo))
            return null;

        bool usedUntrained = _catalog.HasNeverBeenClassified(categoryInfo.Name);
        float confidence = response.Confidence;
        bool isReliable = confidence >= _settings.ConfidenceThreshold && !usedUntrained;

        return BuildResult(
            transaction,
            categoryInfo.Name,
            categoryInfo.GroupName,
            transaction.PayeeName,
            confidence,
            CategorizationMethod.LlmCategorization,
            routeReason,
            featureText,
            requiresManualReview: !isReliable,
            notes: usedUntrained
                ? "LLM suggested a category with no local training history; review recommended."
                : response.Rationale);
    }

    private IReadOnlyList<CategoryInfo> BuildLlmCandidates(string? suggestedGroupName)
    {
        if (!string.IsNullOrWhiteSpace(suggestedGroupName))
        {
            IReadOnlyList<CategoryInfo> inGroup = _catalog.GetCategoriesInGroup(suggestedGroupName);
            IReadOnlyList<CategoryInfo> untrained = _catalog.GetUntrainedCategories();

            return inGroup
                .Concat(untrained)
                .DistinctBy(c => c.Id)
                .ToList();
        }

        return _catalog.AllCategories;
    }

    private static LlmRoutingReason MapLlmRoutingReason(CategorizationRouteReason reason) =>
        reason switch
        {
            CategorizationRouteReason.AmbiguousMerchant => LlmRoutingReason.AmbiguousMerchant,
            CategorizationRouteReason.UntrainedCategory => LlmRoutingReason.UntrainedCategory,
            CategorizationRouteReason.NovelImportString => LlmRoutingReason.NovelImportString,
            _ => LlmRoutingReason.NoLocalPrediction
        };

    private static CategorizationResult BuildExcludedResult(
        PendingTransaction transaction,
        string featureText,
        ExclusionKind kind) =>
        new()
        {
            TransactionId = transaction.Id,
            PredictedCategory = null,
            ResolvedPayee = transaction.PayeeName,
            Confidence = 0,
            Method = CategorizationMethod.Excluded,
            RouteReason = kind == ExclusionKind.Check
                ? CategorizationRouteReason.ExcludedCheck
                : CategorizationRouteReason.ExcludedPayee,
            IsReliable = false,
            RequiresManualReview = true,
            FeatureText = featureText,
            Notes = kind == ExclusionKind.Check
                ? "Check transaction — skipped auto-classification."
                : "Excluded payee — skipped auto-classification."
        };

    private static string BuildFeatureText(
        string? importOriginal,
        string? importPayee,
        string? payeeName,
        string? memo)
    {
        string primary = TextPreprocessor.PrimaryImportText(importOriginal, importPayee, payeeName);
        if (string.IsNullOrWhiteSpace(memo))
            return primary;

        return $"{primary} {memo}".Trim();
    }

    private CategorizationResult BuildResult(
        PendingTransaction transaction,
        string category,
        string? categoryGroup,
        string? resolvedPayee,
        float confidence,
        CategorizationMethod method,
        CategorizationRouteReason routeReason,
        string featureText,
        bool requiresManualReview = false,
        string? notes = null)
    {
        string? group = categoryGroup;
        if (group == null && _catalog.TryGetCategory(category, out CategoryInfo? info))
            group = info.GroupName;

        bool untrained = _catalog.HasNeverBeenClassified(category);
        bool isReliable = !requiresManualReview
            && !untrained
            && confidence >= _settings.ConfidenceThreshold;

        return new CategorizationResult
        {
            TransactionId = transaction.Id,
            PredictedCategory = category,
            PredictedCategoryGroup = group,
            ResolvedPayee = resolvedPayee,
            Confidence = confidence,
            Method = method,
            RouteReason = routeReason,
            IsReliable = isReliable,
            RequiresManualReview = requiresManualReview || untrained || !isReliable,
            FeatureText = featureText,
            Notes = untrained
                ? "Category has no training history; review recommended."
                : notes
        };
    }
}
