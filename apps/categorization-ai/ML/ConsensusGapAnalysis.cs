using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public enum ConsensusGapReason
{
    /// <summary>3+ eligible methods agree on the correct category but ambiguous merchant blocks auto-apply.</summary>
    AmbiguousBlockedCorrect,

    /// <summary>2 eligible methods agree on correct category; needs one fewer vote.</summary>
    TwoEligibleAgreeCorrect,

    /// <summary>ImportAmount alone is correct but below solo threshold (e.g. 90–97%).</summary>
    ImportAmountSoloNearMiss,

    /// <summary>Single eligible method correct at confidence threshold.</summary>
    SingleEligibleCorrect,

    /// <summary>Methods fire but none predict the correct category confidently.</summary>
    NoCorrectSignal,

    /// <summary>Eligible methods agree confidently on the wrong category.</summary>
    ConfidentWrongAgreement,

    /// <summary>Eligible methods split across categories; no clear winner.</summary>
    SplitSignals
}

public sealed record ConsensusGapExample(
    string TransactionId,
    string FeatureText,
    string ActualCategory,
    string? BestCorrectCategory,
    int CorrectEligibleMethodCount,
    int MaxWrongAgreementCount,
    bool IsAmbiguous,
    bool IsNovelImport,
    ConsensusGapReason Reason,
    IReadOnlyList<MethodSignal> EligibleSignals);

public sealed class ConsensusGapReport
{
    public required int TotalEligible { get; init; }
    public required int AutoApplied { get; init; }
    public required int AutoAppliedCorrect { get; init; }
    public required int ManualReview { get; init; }

    /// <summary>Manual-review txs where a safe loosening could yield the right category.</summary>
    public required int RecoverableCorrect { get; init; }

    public required Dictionary<ConsensusGapReason, int> ManualReviewByReason { get; init; }

    public required Dictionary<ConsensusGapReason, int> RecoverableByReason { get; init; }

    public double RecoverableShareOfManual =>
        ManualReview == 0 ? 0 : (double)RecoverableCorrect / ManualReview;

    public double RecoverableShareOfEligible =>
        TotalEligible == 0 ? 0 : (double)RecoverableCorrect / TotalEligible;
}

public static class ConsensusGapAnalysis
{
    private static readonly HashSet<ConsensusGapReason> RecoverableReasons =
    [
        ConsensusGapReason.AmbiguousBlockedCorrect,
        ConsensusGapReason.TwoEligibleAgreeCorrect,
        ConsensusGapReason.ImportAmountSoloNearMiss,
        ConsensusGapReason.SingleEligibleCorrect
    ];

    public static ConsensusGapReport Analyze(
        IEnumerable<SignalRow> signalRows,
        AmbiguousMerchantIndex ambiguousIndex,
        CategoryCatalog catalog,
        ConsensusSettings settings)
    {
        int autoApplied = 0;
        int autoAppliedCorrect = 0;
        int manualReview = 0;
        int recoverableCorrect = 0;
        var manualByReason = new Dictionary<ConsensusGapReason, int>();
        var recoverableByReason = new Dictionary<ConsensusGapReason, int>();

        foreach (SignalRow row in signalRows.Where(r => !r.IsExcluded))
        {
            TrainingTransaction t = row.Transaction;
            bool isAmbiguous = ambiguousIndex.IsAmbiguous(t);
            bool isNovelImport = !catalog.HasSeenImportString(t.ImportPayeeNameOriginal);

            bool gotConsensus = AgreementAnalysis.TryGetStrictConsensus(
                row.Signals,
                settings,
                out string? consensusCategory,
                out _,
                out _);

            bool consensusCorrect = gotConsensus
                && CategoryNormalizer.AreEquivalent(consensusCategory, t.CategoryName);

            if (gotConsensus && !isAmbiguous)
            {
                autoApplied++;
                if (consensusCorrect)
                    autoAppliedCorrect++;
                continue;
            }

            manualReview++;

            ConsensusGapExample gap = ClassifyManualReview(
                row,
                isAmbiguous,
                isNovelImport,
                gotConsensus,
                consensusCategory,
                settings);

            manualByReason[gap.Reason] = manualByReason.GetValueOrDefault(gap.Reason) + 1;

            if (RecoverableReasons.Contains(gap.Reason))
            {
                recoverableCorrect++;
                recoverableByReason[gap.Reason] = recoverableByReason.GetValueOrDefault(gap.Reason) + 1;
            }
        }

        int eligible = signalRows.Count(r => !r.IsExcluded);

        return new ConsensusGapReport
        {
            TotalEligible = eligible,
            AutoApplied = autoApplied,
            AutoAppliedCorrect = autoAppliedCorrect,
            ManualReview = manualReview,
            RecoverableCorrect = recoverableCorrect,
            ManualReviewByReason = manualByReason,
            RecoverableByReason = recoverableByReason
        };
    }

    public static IReadOnlyList<ConsensusGapExample> FindRecoverableExamples(
        IEnumerable<SignalRow> signalRows,
        AmbiguousMerchantIndex ambiguousIndex,
        CategoryCatalog catalog,
        ConsensusSettings settings,
        int limit = 20) =>
        signalRows
            .Where(r => !r.IsExcluded)
            .Select(row =>
            {
                bool isAmbiguous = ambiguousIndex.IsAmbiguous(row.Transaction);
                bool isNovelImport = !catalog.HasSeenImportString(row.Transaction.ImportPayeeNameOriginal);
                bool gotConsensus = AgreementAnalysis.TryGetStrictConsensus(
                    row.Signals,
                    settings,
                    out string? consensusCategory,
                    out _,
                    out _);

                if (gotConsensus && !isAmbiguous)
                    return null;

                return ClassifyManualReview(
                    row,
                    isAmbiguous,
                    isNovelImport,
                    gotConsensus,
                    consensusCategory,
                    settings);
            })
            .Where(ex => ex != null && RecoverableReasons.Contains(ex.Reason))
            .Cast<ConsensusGapExample>()
            .Take(limit)
            .ToList();

    private static ConsensusGapExample ClassifyManualReview(
        SignalRow row,
        bool isAmbiguous,
        bool isNovelImport,
        bool gotConsensus,
        string? consensusCategory,
        ConsensusSettings settings)
    {
        TrainingTransaction t = row.Transaction;
        string actual = t.CategoryName;

        List<MethodSignal> eligible = row.Signals
            .Where(s => s.Confidence >= settings.ConfidenceThreshold)
            .Where(s => settings.IsEligible(s.Method))
            .ToList();

        List<MethodSignal> correctEligible = eligible
            .Where(s => CategoryNormalizer.AreEquivalent(s.Category, actual))
            .ToList();

        int correctMethodCount = correctEligible
            .Select(s => s.Method)
            .Distinct()
            .Count();

        var wrongAgreementGroups = eligible
            .Where(s => !CategoryNormalizer.AreEquivalent(s.Category, actual))
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => new { Category = g.Key, MethodCount = g.Select(x => x.Method).Distinct().Count() })
            .OrderByDescending(x => x.MethodCount)
            .ToList();

        int maxWrongAgreement = wrongAgreementGroups.FirstOrDefault()?.MethodCount ?? 0;

        if (isAmbiguous && gotConsensus)
        {
            ConsensusGapReason reason = CategoryNormalizer.AreEquivalent(consensusCategory, actual)
                ? ConsensusGapReason.AmbiguousBlockedCorrect
                : ConsensusGapReason.ConfidentWrongAgreement;

            return BuildExample(
                row, actual,
                reason == ConsensusGapReason.AmbiguousBlockedCorrect ? actual : null,
                correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, reason, eligible);
        }

        if (correctMethodCount >= 2
            && (correctMethodCount >= settings.MinAgreeingMethodsWithStrongSignal
                && correctEligible.Any(s => settings.StrongSignalMethods.Contains(s.Method))
                || correctMethodCount == 2))
        {
            return BuildExample(
                row, actual, actual, correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, ConsensusGapReason.TwoEligibleAgreeCorrect, eligible);
        }

        MethodSignal? soloImport = correctEligible
            .Where(s => s.Method == CategorizationMethod.ImportAmountLookup)
            .OrderByDescending(s => s.Confidence)
            .FirstOrDefault();

        if (soloImport != null
            && soloImport.Value.Confidence >= settings.ConfidenceThreshold
            && soloImport.Value.Confidence < settings.ImportAmountSoloThreshold)
        {
            return BuildExample(
                row, actual, actual, correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, ConsensusGapReason.ImportAmountSoloNearMiss, eligible);
        }

        if (correctMethodCount == 1)
        {
            return BuildExample(
                row, actual, actual, correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, ConsensusGapReason.SingleEligibleCorrect, eligible);
        }

        if (maxWrongAgreement >= settings.MinAgreeingMethods)
        {
            return BuildExample(
                row, actual, null, correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, ConsensusGapReason.ConfidentWrongAgreement, eligible);
        }

        if (eligible.Count == 0)
        {
            return BuildExample(
                row, actual, null, correctMethodCount, maxWrongAgreement,
                isAmbiguous, isNovelImport, ConsensusGapReason.NoCorrectSignal, eligible);
        }

        return BuildExample(
            row, actual, null, correctMethodCount, maxWrongAgreement,
            isAmbiguous, isNovelImport,
            correctMethodCount > 0 ? ConsensusGapReason.SplitSignals : ConsensusGapReason.NoCorrectSignal,
            eligible);
    }

    private static ConsensusGapExample BuildExample(
        SignalRow row,
        string actual,
        string? bestCorrect,
        int correctMethodCount,
        int maxWrongAgreement,
        bool isAmbiguous,
        bool isNovelImport,
        ConsensusGapReason reason,
        IReadOnlyList<MethodSignal> eligible)
    {
        TrainingTransaction t = row.Transaction;
        string featureText = TextPreprocessor.PrimaryImportText(
            t.ImportPayeeNameOriginal,
            t.ImportPayeeName,
            t.PayeeName);

        return new ConsensusGapExample(
            t.Id,
            featureText,
            actual,
            bestCorrect,
            correctMethodCount,
            maxWrongAgreement,
            isAmbiguous,
            isNovelImport,
            reason,
            eligible);
    }

    public static void PrintReport(
        ConsensusGapReport report,
        ConsensusSettings settings,
        IReadOnlyList<ConsensusGapExample>? samples = null)
    {
        Console.WriteLine();
        Console.WriteLine("=== Consensus gap analysis (manual-review bucket) ===");
        Console.WriteLine(
            $"Eligible: {report.TotalEligible} | Auto-applied: {report.AutoApplied} " +
            $"({report.AutoAppliedCorrect} correct) | Manual review: {report.ManualReview}");
        Console.WriteLine(
            $"Recoverable (correct answer available, gate blocked): {report.RecoverableCorrect} " +
            $"({report.RecoverableShareOfManual:P1} of manual, {report.RecoverableShareOfEligible:P1} of eligible)");

        Console.WriteLine();
        Console.WriteLine("Why manual review (all):");
        foreach ((ConsensusGapReason reason, int count) in report.ManualReviewByReason
                     .OrderByDescending(kvp => kvp.Value))
        {
            string tag = RecoverableReasons.Contains(reason) ? " [recoverable]" : string.Empty;
            Console.WriteLine($"  {reason}: {count}{tag}");
        }

        Console.WriteLine();
        Console.WriteLine("Potential coverage if recovered (at today's eligible-method precision):");
        int hypotheticalApplied = report.AutoApplied + report.RecoverableCorrect;
        double hypotheticalCoverage = report.TotalEligible == 0
            ? 0
            : (double)hypotheticalApplied / report.TotalEligible;
        Console.WriteLine(
            $"  {hypotheticalApplied}/{report.TotalEligible} = {hypotheticalCoverage:P1} auto-apply coverage " +
            $"(+{report.RecoverableCorrect} txs, up from {report.AutoApplied})");

        Console.WriteLine();
        Console.WriteLine("Suggested levers:");
        PrintLeverHints(report, settings);

        if (samples is { Count: > 0 })
        {
            Console.WriteLine();
            Console.WriteLine($"Sample recoverable transactions (up to {samples.Count}):");
            foreach (ConsensusGapExample ex in samples)
            {
                string signals = string.Join(", ",
                    ex.EligibleSignals.Select(s => $"{s.Method}→{s.Category}@{s.Confidence:P0}"));
                Console.WriteLine($"  [{ex.Reason}] {ex.FeatureText}");
                Console.WriteLine($"    actual: {ex.ActualCategory} | ambiguous: {ex.IsAmbiguous} | novel: {ex.IsNovelImport}");
                Console.WriteLine($"    eligible signals: {signals}");
            }
        }
    }

    private static void PrintLeverHints(ConsensusGapReport report, ConsensusSettings settings)
    {
        int twoMethod = report.RecoverableByReason.GetValueOrDefault(ConsensusGapReason.TwoEligibleAgreeCorrect);
        int ambiguous = report.RecoverableByReason.GetValueOrDefault(ConsensusGapReason.AmbiguousBlockedCorrect);
        int soloNear = report.RecoverableByReason.GetValueOrDefault(ConsensusGapReason.ImportAmountSoloNearMiss);
        int single = report.RecoverableByReason.GetValueOrDefault(ConsensusGapReason.SingleEligibleCorrect);
        int wrongAgreement = report.ManualReviewByReason.GetValueOrDefault(ConsensusGapReason.ConfidentWrongAgreement);

        if (twoMethod > 0)
        {
            Console.WriteLine(
                $"  • AllowStrongSignalPair (ImportAmount+Hierarchical only): up to ~{twoMethod} txs " +
                $"(verify precision on holdout before enabling)");
        }

        if (soloNear > 0)
        {
            Console.WriteLine(
                $"  • Lower ImportAmountSoloThreshold from {settings.ImportAmountSoloThreshold:P0}: " +
                $"up to ~{soloNear} txs");
        }

        if (ambiguous > 0)
        {
            Console.WriteLine(
                $"  • LLM for {ambiguous} ambiguous-but-agreeing txs (consensus blocked by design)");
        }

        if (single > 0)
        {
            Console.WriteLine(
                $"  • Tier-2 solo Hierarchical/CategoryModel (review-suggested): up to ~{single} txs — risky alone");
        }

        if (wrongAgreement > 0)
        {
            Console.WriteLine(
                $"  • {wrongAgreement} txs have confident wrong agreement — do NOT loosen gate");
        }
    }
}
