using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public static class CategorizationProposalBuilder
{
    public static CategorizationProposal BuildExcluded(
        PendingTransaction transaction,
        string featureText,
        ExclusionKind kind,
        PayeeResolutionResult payeeResolution)
    {
        PayeeProposalFields payee = BuildPayeeFields(transaction, payeeResolution);
        return new()
        {
            TransactionId = transaction.Id,
            Tier = ApprovalTier.Blocked,
            Flags = new CategorizationFlags
            {
                IsExcluded = true,
                RequiresManualReview = true
            },
            RouteReason = kind == ExclusionKind.Check
                ? CategorizationRouteReason.ExcludedCheck
                : CategorizationRouteReason.ExcludedPayee,
            GapReason = ProposalGapReason.Excluded,
            Method = CategorizationMethod.Excluded,
            FeatureText = featureText,
            ResolvedPayee = payee.ResolvedPayee,
            PayeeSuggestion = payee.Suggestion,
            Notes = kind == ExclusionKind.Check
                ? "Check transaction — skipped auto-classification."
                : "Excluded payee — skipped auto-classification."
        };
    }

    public static CategorizationProposal BuildFromPipelineState(
        PendingTransaction transaction,
        string featureText,
        IReadOnlyList<MethodSignal> signals,
        bool isAmbiguous,
        bool isNovelImport,
        MlSettings mlSettings,
        CategoryCatalog catalog,
        bool gotConsensus,
        string? consensusCategory,
        IReadOnlyList<MethodSignal> agreeingSignals,
        float consensusConfidence,
        CategorizationResult? llmResult,
        PeriodicMatch? periodicMatch = null,
        bool isPeriodicConflict = false,
        PayeeResolutionResult payeeResolution = default)
    {
        PayeeProposalFields payee = BuildPayeeFields(transaction, payeeResolution);
        IReadOnlyList<MethodSignalDto> signalDtos = ToDtos(signals);
        IReadOnlyList<CategoryOptionDto> options = CategoryOptionRanker.Rank(
            signals,
            catalog,
            mlSettings.OptionConfidenceFloor,
            mlSettings.MaxRankedOptions);
        ConfidenceIntervalDto interval = CategoryOptionRanker.BuildInterval(options);
        ConsensusSettings consensusSettings = mlSettings.Consensus;

        if (gotConsensus && !isAmbiguous && consensusCategory != null)
        {
            ResolveCategory(catalog, consensusCategory, out string? group, out string? id);
            return Finalize(new CategorizationProposal
            {
                TransactionId = transaction.Id,
                Tier = ApprovalTier.AutoApply,
                Flags = new CategorizationFlags
                {
                    IsAmbiguous = isAmbiguous,
                    IsNovelImport = isNovelImport,
                    RequiresManualReview = false
                },
                SuggestedCategory = consensusCategory,
                SuggestedCategoryGroup = group,
                SuggestedCategoryId = id,
                Confidence = consensusConfidence,
                Method = CategorizationMethod.Consensus,
                RouteReason = CategorizationRouteReason.None,
                GapReason = ProposalGapReason.None,
                Signals = signalDtos,
                AgreeingSignals = ToDtos(agreeingSignals),
                FeatureText = featureText,
                ResolvedPayee = payee.ResolvedPayee,
                PayeeSuggestion = payee.Suggestion,
                Notes = $"Consensus: {string.Join(", ", agreeingSignals.Select(s => s.Method))}"
            }, options, interval, periodicMatch, isPeriodicConflict);
        }

        if (llmResult?.PredictedCategory != null)
        {
            return Finalize(new CategorizationProposal
            {
                TransactionId = transaction.Id,
                Tier = ApprovalTier.Suggested,
                Flags = new CategorizationFlags
                {
                    IsAmbiguous = isAmbiguous,
                    IsNovelImport = isNovelImport,
                    RequiresManualReview = llmResult.RequiresManualReview
                },
                SuggestedCategory = llmResult.PredictedCategory,
                SuggestedCategoryGroup = llmResult.PredictedCategoryGroup,
                Confidence = llmResult.Confidence,
                Method = CategorizationMethod.LlmCategorization,
                RouteReason = llmResult.RouteReason,
                GapReason = ProposalGapReason.LlmSuggestion,
                Signals = signalDtos,
                AgreeingSignals = [],
                FeatureText = featureText,
                ResolvedPayee = payee.ResolvedPayee,
                PayeeSuggestion = payee.Suggestion,
                Notes = llmResult.Notes
            }, options, interval, periodicMatch, isPeriodicConflict, llmResult.PredictedCategory);
        }

        ProposalAnalysis analysis = AnalyzeEligibleSignals(signals, consensusSettings, isAmbiguous, gotConsensus);

        if (analysis.BestSuggestion != null)
        {
            CategorySuggestionDto best = analysis.BestSuggestion;
            ResolveCategory(catalog, best.Category, out string? group, out string? id);
            ApprovalTier tier = analysis.GapReason is ProposalGapReason.TwoMethodSuggestion
                    or ProposalGapReason.ImportAmountNearMiss
                    or ProposalGapReason.SingleMethodSuggestion
                ? ApprovalTier.Suggested
                : ApprovalTier.Review;

            CategorizationRouteReason routeReason = isAmbiguous
                ? CategorizationRouteReason.AmbiguousMerchant
                : isNovelImport
                    ? CategorizationRouteReason.NovelImportString
                    : CategorizationRouteReason.LowConfidence;

            return Finalize(new CategorizationProposal
            {
                TransactionId = transaction.Id,
                Tier = tier,
                Flags = new CategorizationFlags
                {
                    IsAmbiguous = isAmbiguous,
                    IsNovelImport = isNovelImport,
                    RequiresManualReview = true
                },
                SuggestedCategory = best.Category,
                SuggestedCategoryGroup = group ?? best.CategoryGroup,
                SuggestedCategoryId = id ?? best.CategoryId,
                Confidence = best.Confidence,
                Method = best.PrimaryMethod,
                RouteReason = routeReason,
                GapReason = analysis.GapReason,
                Signals = signalDtos,
                AgreeingSignals = ToDtos(analysis.AgreeingSignals),
                FeatureText = featureText,
                ResolvedPayee = payee.ResolvedPayee,
                PayeeSuggestion = payee.Suggestion,
                Notes = BuildReviewNotes(analysis, isAmbiguous, isPeriodicConflict)
            }, options, interval, periodicMatch, isPeriodicConflict);
        }

        return Finalize(new CategorizationProposal
        {
            TransactionId = transaction.Id,
            Tier = ApprovalTier.Review,
            Flags = new CategorizationFlags
            {
                IsAmbiguous = isAmbiguous,
                IsNovelImport = isNovelImport,
                RequiresManualReview = true
            },
            RouteReason = isAmbiguous
                ? CategorizationRouteReason.AmbiguousMerchant
                : isNovelImport
                    ? CategorizationRouteReason.NovelImportString
                    : CategorizationRouteReason.LowConfidence,
            GapReason = analysis.GapReason,
            Method = CategorizationMethod.ManualReview,
            Signals = signalDtos,
            FeatureText = featureText,
            ResolvedPayee = payee.ResolvedPayee,
            PayeeSuggestion = payee.Suggestion,
            Notes = isAmbiguous
                ? "Ambiguous merchant — pick a category or choose an option below."
                : options.Count > 0
                    ? "Pick the best option below or search for another category."
                    : "No strong local prediction — search for a category."
        }, options, interval, periodicMatch, isPeriodicConflict);
    }

    private static CategorizationProposal Finalize(
        CategorizationProposal draft,
        IReadOnlyList<CategoryOptionDto> options,
        ConfidenceIntervalDto interval,
        PeriodicMatch? periodicMatch,
        bool isPeriodicConflict,
        string? preferredCategory = null)
    {
        CategoryOptionDto? top = options.FirstOrDefault();
        string? suggestedCategory = draft.SuggestedCategory ?? preferredCategory ?? top?.Category;
        CategoryOptionDto? matchingOption = options.FirstOrDefault(o =>
            suggestedCategory != null
            && CategoryNormalizer.AreEquivalent(o.Category, suggestedCategory));

        ApprovalTier tier = isPeriodicConflict ? ApprovalTier.Review : draft.Tier;
        ProposalGapReason gapReason = isPeriodicConflict ? ProposalGapReason.PeriodicConflict : draft.GapReason;
        string? notes = isPeriodicConflict
            ? "Periodic series category disagrees with other methods — confirm before accepting."
            : draft.Notes;

        return new CategorizationProposal
        {
            TransactionId = draft.TransactionId,
            Tier = tier,
            Flags = new CategorizationFlags
            {
                IsAmbiguous = draft.Flags.IsAmbiguous,
                IsNovelImport = draft.Flags.IsNovelImport,
                IsExcluded = draft.Flags.IsExcluded,
                RequiresManualReview = isPeriodicConflict || draft.Flags.RequiresManualReview,
                IsPeriodic = periodicMatch != null,
                IsPeriodicConflict = isPeriodicConflict
            },
            SuggestedCategory = suggestedCategory,
            SuggestedCategoryGroup = draft.SuggestedCategoryGroup ?? matchingOption?.CategoryGroup,
            SuggestedCategoryId = draft.SuggestedCategoryId ?? matchingOption?.CategoryId,
            Confidence = draft.Confidence > 0 ? draft.Confidence : matchingOption?.Confidence ?? 0,
            Method = draft.Method,
            RouteReason = draft.RouteReason,
            GapReason = gapReason,
            Signals = draft.Signals,
            AgreeingSignals = draft.AgreeingSignals,
            Options = options,
            ConfidenceInterval = interval,
            FeatureText = draft.FeatureText,
            ResolvedPayee = draft.ResolvedPayee,
            PayeeSuggestion = draft.PayeeSuggestion,
            Notes = notes,
            PeriodicMatch = periodicMatch
        };
    }

    private static ProposalAnalysis AnalyzeEligibleSignals(
        IReadOnlyList<MethodSignal> signals,
        ConsensusSettings settings,
        bool isAmbiguous,
        bool gotConsensus)
    {
        List<MethodSignal> eligible = signals
            .Where(s => s.Confidence >= settings.ConfidenceThreshold)
            .Where(s => settings.IsEligible(s.Method))
            .ToList();

        if (isAmbiguous && gotConsensus)
        {
            CategorySuggestionDto? blocked = BuildBestSuggestion(eligible);
            return new ProposalAnalysis(
                blocked,
                eligible,
                ProposalGapReason.AmbiguousMerchant);
        }

        MethodSignal? soloImport = eligible
            .Where(s => s.Method == CategorizationMethod.ImportAmountLookup)
            .OrderByDescending(s => s.Confidence)
            .FirstOrDefault();

        if (soloImport != null
            && soloImport.Value.Confidence >= settings.ConfidenceThreshold
            && soloImport.Value.Confidence < settings.ImportAmountSoloThreshold)
        {
            return new ProposalAnalysis(
                ToSuggestion(soloImport.Value, eligible),
                [soloImport.Value],
                ProposalGapReason.ImportAmountNearMiss);
        }

        var groups = eligible
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                Category = g.Key,
                MethodCount = g.Select(x => x.Method).Distinct().Count(),
                AvgConfidence = g.Average(x => x.Confidence),
                Signals = g.ToList()
            })
            .OrderByDescending(x => x.MethodCount)
            .ThenByDescending(x => x.AvgConfidence)
            .ToList();

        if (groups.Count == 0)
        {
            return new ProposalAnalysis(null, [], ProposalGapReason.NoQualifiedSignals);
        }

        var best = groups[0];
        CategorySuggestionDto suggestion = ToSuggestion(best.Signals);

        if (best.MethodCount >= settings.MinAgreeingMethods)
        {
            return new ProposalAnalysis(
                suggestion,
                best.Signals,
                ProposalGapReason.InsufficientAgreement);
        }

        if (best.MethodCount >= 2)
        {
            return new ProposalAnalysis(
                suggestion,
                best.Signals,
                ProposalGapReason.TwoMethodSuggestion);
        }

        if (best.MethodCount == 1)
        {
            return new ProposalAnalysis(
                suggestion,
                best.Signals,
                ProposalGapReason.SingleMethodSuggestion);
        }

        return new ProposalAnalysis(suggestion, best.Signals, ProposalGapReason.InsufficientAgreement);
    }

    private static CategorySuggestionDto? BuildBestSuggestion(IReadOnlyList<MethodSignal> eligible)
    {
        if (eligible.Count == 0)
            return null;

        return eligible
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => ToSuggestion(g.ToList()))
            .OrderByDescending(s => s.AgreeingMethodCount)
            .ThenByDescending(s => s.Confidence)
            .First();
    }

    private static CategorySuggestionDto ToSuggestion(MethodSignal signal, IReadOnlyList<MethodSignal>? all = null)
    {
        IReadOnlyList<MethodSignal> agreeing = all?
            .Where(s => CategoryNormalizer.AreEquivalent(s.Category, signal.Category))
            .ToList() ?? [signal];

        return ToSuggestion(agreeing);
    }

    private static CategorySuggestionDto ToSuggestion(IReadOnlyList<MethodSignal> agreeing)
    {
        MethodSignal best = agreeing.OrderByDescending(s => s.Confidence).First();
        IReadOnlyList<CategorizationMethod> methods = agreeing
            .Select(s => s.Method)
            .Distinct()
            .ToList();

        return new CategorySuggestionDto(
            best.Category,
            CategoryGroup: null,
            CategoryId: null,
            Confidence: (float)agreeing.Average(s => s.Confidence),
            PrimaryMethod: best.Method,
            AgreeingMethodCount: methods.Count,
            AgreeingMethods: methods);
    }

    private static IReadOnlyList<MethodSignalDto> ToDtos(IEnumerable<MethodSignal> signals) =>
        signals.Select(s => new MethodSignalDto(s.Method, s.Category, s.Confidence)).ToList();

    private static void ResolveCategory(CategoryCatalog catalog, string category, out string? group, out string? id)
    {
        if (catalog.TryResolveCategory(category, out CategoryInfo info))
        {
            group = info.GroupName;
            id = info.Id;
            return;
        }

        group = null;
        id = null;
    }

    private static string BuildReviewNotes(ProposalAnalysis analysis, bool isAmbiguous, bool isPeriodicConflict)
    {
        if (isPeriodicConflict)
            return "Periodic series category disagrees with other methods — confirm before accepting.";

        if (isAmbiguous && analysis.GapReason == ProposalGapReason.AmbiguousMerchant)
            return "Consensus would apply but merchant is ambiguous — confirm before accepting.";

        return analysis.GapReason switch
        {
            ProposalGapReason.TwoMethodSuggestion =>
                $"{analysis.BestSuggestion!.AgreeingMethodCount} models agree — one-tap approve candidate.",
            ProposalGapReason.SingleMethodSuggestion =>
                $"Single model suggestion ({analysis.BestSuggestion!.PrimaryMethod}).",
            ProposalGapReason.ImportAmountNearMiss =>
                "Import+amount match is strong but below solo auto-apply threshold.",
            _ => "Review suggested category or pick an alternative."
        };
    }

    private readonly record struct ProposalAnalysis(
        CategorySuggestionDto? BestSuggestion,
        IReadOnlyList<MethodSignal> AgreeingSignals,
        ProposalGapReason GapReason);

    private static PayeeProposalFields BuildPayeeFields(
        PendingTransaction transaction,
        PayeeResolutionResult resolution)
    {
        if (resolution.Method == PayeeResolutionMethod.Unresolved
            || string.IsNullOrWhiteSpace(resolution.ResolvedPayee))
        {
            return new PayeeProposalFields(transaction.PayeeName, null);
        }

        bool needsRename = PayeeRename.NeedsRename(
            transaction.PayeeName,
            resolution.ResolvedPayee,
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName);

        return new PayeeProposalFields(
            resolution.ResolvedPayee,
            new PayeeSuggestionDto(
                resolution.ResolvedPayee,
                resolution.Method,
                resolution.Confidence,
                needsRename));
    }

    private readonly record struct PayeeProposalFields(
        string? ResolvedPayee,
        PayeeSuggestionDto? Suggestion);
}
