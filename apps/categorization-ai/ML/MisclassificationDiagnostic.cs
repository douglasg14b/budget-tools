namespace YnabCategoryAi.ML;

using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

public sealed record SignalRow(
    TrainingTransaction Transaction,
    IReadOnlyList<MethodSignal> Signals,
    bool IsExcluded);

public sealed record MisclassificationExample(
    string TransactionId,
    string FeatureText,
    string? PayeeName,
    string? ImportOriginal,
    string? Memo,
    decimal AmountDollars,
    string AccountName,
    DateOnly Date,
    string ActualCategory,
    string PredictedCategory,
    IReadOnlyList<MethodSignal> AgreeingSignals,
    string ErrorPattern);

public static class MisclassificationDiagnostic
{
    public static IReadOnlyList<MisclassificationExample> FindConsensusErrors(
        IEnumerable<SignalRow> rows,
        float confidenceThreshold,
        int minAgreeingMethods)
    {
        var errors = new List<MisclassificationExample>();

        foreach (SignalRow row in rows.Where(r => !r.IsExcluded))
        {
            if (!AgreementAnalysis.TryGetConsensusDetailed(
                    row.Signals,
                    confidenceThreshold,
                    minAgreeingMethods,
                    out string? predicted,
                    out IReadOnlyList<MethodSignal> agreeing))
            {
                continue;
            }

            if (CategoryNormalizer.AreEquivalent(predicted, row.Transaction.CategoryName))
                continue;

            errors.Add(ToExample(row, predicted!, agreeing));
        }

        return errors;
    }

    public static IReadOnlyList<MisclassificationExample> FindStrictConsensusErrors(
        IEnumerable<SignalRow> rows,
        ConsensusSettings settings)
    {
        var errors = new List<MisclassificationExample>();

        foreach (SignalRow row in rows.Where(r => !r.IsExcluded))
        {
            if (!AgreementAnalysis.TryGetStrictConsensus(
                    row.Signals,
                    settings,
                    out string? predicted,
                    out IReadOnlyList<MethodSignal> agreeing,
                    out _))
            {
                continue;
            }

            if (CategoryNormalizer.AreEquivalent(predicted, row.Transaction.CategoryName))
                continue;

            errors.Add(ToExample(row, predicted!, agreeing));
        }

        return errors;
    }

    public static IReadOnlyList<MisclassificationExample> FindPipelineErrors(
        IEnumerable<(CategorizationResult Result, TrainingTransaction Transaction, bool Correct)> rows)
    {
        return rows
            .Where(r => CategorizationMetrics.IsEligibleForMetrics(r.Result))
            .Where(r => r.Result.IsReliable && r.Result.PredictedCategory != null && !r.Correct)
            .Select(r => new MisclassificationExample(
                r.Transaction.Id,
                r.Result.FeatureText,
                r.Transaction.PayeeName,
                r.Transaction.ImportPayeeNameOriginal,
                r.Transaction.Memo,
                Math.Abs(r.Transaction.Amount) / 1000m,
                r.Transaction.AccountName,
                r.Transaction.Date,
                r.Transaction.CategoryName,
                r.Result.PredictedCategory!,
                [new MethodSignal(r.Result.Method, r.Result.PredictedCategory!, r.Result.Confidence)],
                $"pipeline:{r.Result.Method}"))
            .ToList();
    }

    public static void PrintReport(
        IReadOnlyList<MisclassificationExample> consensusErrors,
        float confidenceThreshold,
        int minAgreeingMethods,
        int sampleLimit = 25)
    {
        Console.WriteLine();
        Console.WriteLine(
            $"=== Misclassifications: {minAgreeingMethods}+ methods agree >= {confidenceThreshold:P0} ===");
        Console.WriteLine($"Total wrong: {consensusErrors.Count}");

        if (consensusErrors.Count == 0)
            return;

        Console.WriteLine();
        Console.WriteLine("Top (predicted → actual) confusion pairs:");
        foreach (var group in consensusErrors
                     .GroupBy(e => (e.PredictedCategory, e.ActualCategory))
                     .OrderByDescending(g => g.Count())
                     .Take(15))
        {
            Console.WriteLine($"  {group.Key.PredictedCategory} → {group.Key.ActualCategory}: {group.Count()}");
        }

        Console.WriteLine();
        Console.WriteLine("Methods involved in wrong consensus:");
        foreach (var group in consensusErrors
                     .SelectMany(e => e.AgreeingSignals.Select(s => s.Method))
                     .GroupBy(m => m)
                     .OrderByDescending(g => g.Count()))
        {
            Console.WriteLine($"  {group.Key}: {group.Count()}");
        }

        Console.WriteLine();
        Console.WriteLine("Payees most often wrong under consensus:");
        foreach (var group in consensusErrors
                     .GroupBy(e => e.PayeeName ?? e.ImportOriginal ?? e.FeatureText)
                     .OrderByDescending(g => g.Count())
                     .Take(15))
        {
            Console.WriteLine($"  {group.Key}: {group.Count()}");
        }

        Console.WriteLine();
        Console.WriteLine($"Sample errors (up to {sampleLimit}):");
        foreach (MisclassificationExample ex in consensusErrors.Take(sampleLimit))
        {
            string methods = string.Join(", ",
                ex.AgreeingSignals.Select(s => $"{s.Method}@{s.Confidence:P0}"));
            Console.WriteLine($"  [{ex.Date}] {ex.FeatureText}");
            Console.WriteLine($"    ${ex.AmountDollars:F2} on {ex.AccountName}");
            Console.WriteLine($"    predicted: {ex.PredictedCategory}");
            Console.WriteLine($"    actual:    {ex.ActualCategory}");
            Console.WriteLine($"    methods:   {methods}");
            if (!string.IsNullOrWhiteSpace(ex.Memo))
                Console.WriteLine($"    memo:      {ex.Memo}");
        }
    }

    private static MisclassificationExample ToExample(
        SignalRow row,
        string predicted,
        IReadOnlyList<MethodSignal> agreeing)
    {
        TrainingTransaction t = row.Transaction;
        return new MisclassificationExample(
            t.Id,
            BuildFeatureText(t),
            t.PayeeName,
            t.ImportPayeeNameOriginal,
            t.Memo,
            Math.Abs(t.Amount) / 1000m,
            t.AccountName,
            t.Date,
            t.CategoryName,
            predicted,
            agreeing,
            ClassifyErrorPattern(t, predicted, agreeing));
    }

    private static string ClassifyErrorPattern(
        TrainingTransaction t,
        string predicted,
        IReadOnlyList<MethodSignal> agreeing)
    {
        if (agreeing.Any(s => s.Method == CategorizationMethod.PayeeIdLookup))
            return "payee_id_majority_vote";

        if (agreeing.All(s => s.Method is CategorizationMethod.ImportAmountLookup
                or CategorizationMethod.ImportLookup))
            return "import_history_stale_or_ambiguous";

        if (agreeing.Any(s => s.Method is CategorizationMethod.CategoryModel
                or CategorizationMethod.HierarchicalModel))
            return "ml_overconfidence";

        return "mixed_signal_agreement";
    }

    private static string BuildFeatureText(TrainingTransaction t)
    {
        string primary = TextPreprocessor.PrimaryImportText(
            t.ImportPayeeNameOriginal,
            t.ImportPayeeName,
            t.PayeeName);
        return string.IsNullOrWhiteSpace(t.Memo) ? primary : $"{primary} {t.Memo}".Trim();
    }
}
