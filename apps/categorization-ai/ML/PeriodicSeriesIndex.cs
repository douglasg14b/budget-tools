using System.Diagnostics;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public sealed class PeriodicSeriesIndex
{
    private static readonly CadenceSpec[] Cadences =
    [
        new(PeriodicCadence.Weekly, TypicalDays: 7, SlackDays: 2),
        new(PeriodicCadence.Biweekly, TypicalDays: 14, SlackDays: 3),
        new(PeriodicCadence.Monthly, TypicalDays: 30, SlackDays: 5),
        new(PeriodicCadence.Quarterly, TypicalDays: 91, SlackDays: 12),
        new(PeriodicCadence.Yearly, TypicalDays: 365, SlackDays: 20)
    ];

    private readonly List<IndexedSeries> _series = [];
    private PeriodicSeriesSettings _settings = new();

    public int SeriesCount => _series.Count;

    public TimeSpan LastTrainElapsed { get; private set; }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, PeriodicSeriesSettings settings) =>
        Train(transactions.Select(FromTraining).ToList(), settings);

    public void Train(IReadOnlyList<PeriodicHistoryTransaction> transactions, PeriodicSeriesSettings settings)
    {
        Stopwatch stopwatch = Stopwatch.StartNew();
        _settings = settings;
        _series.Clear();

        foreach (IGrouping<string, PeriodicHistoryTransaction> identityGroup in transactions
                     .Select(transaction => (transaction, identity: IdentityKey(transaction)))
                     .Where(row => row.identity != null)
                     .GroupBy(row => row.identity!, row => row.transaction, StringComparer.Ordinal))
        {
            foreach (List<PeriodicHistoryTransaction> amountCluster in ClusterByAmount(identityGroup.ToList(), settings))
            {
                if (!TryBuildSeries(identityGroup.Key, amountCluster, settings, out IndexedSeries series))
                    continue;

                _series.Add(series);
            }
        }

        LastTrainElapsed = stopwatch.Elapsed;
    }

    public PeriodicMatch? TryMatch(PendingTransaction transaction)
    {
        string? identity = IdentityKey(transaction);
        if (identity == null)
            return null;

        IndexedSeries? best = null;
        int bestAmountDelta = int.MaxValue;
        DateOnly bestLastDate = default;

        foreach (IndexedSeries series in _series)
        {
            if (series.IdentityKey != identity)
                continue;

            if (!AmountFits(transaction.Amount, series.MedianAmount, _settings))
                continue;

            IReadOnlyList<SeriesMember> prior = series.Members
                .Where(member => member.Id != transaction.Id)
                .ToList();
            if (prior.Count == 0)
                continue;

            DateOnly lastDate = prior.Max(member => member.Date);
            if (!IsOnCadence(transaction.Date, lastDate, series.MedianIntervalDays, series.SlackDays, _settings, out _))
                continue;

            int amountDelta = Math.Abs(Math.Abs(transaction.Amount) - Math.Abs(series.MedianAmount));
            if (best != null
                && (series.Members.Count < best.Members.Count
                    || (series.Members.Count == best.Members.Count && amountDelta >= bestAmountDelta)))
            {
                continue;
            }

            best = series;
            bestAmountDelta = amountDelta;
            bestLastDate = lastDate;
        }

        return best == null ? null : ToMatch(best, transaction.Id, bestLastDate, _settings);
    }

    public static string? IdentityKey(
        string? payeeId,
        string? payeeName,
        string? importPayeeNameOriginal)
    {
        if (!string.IsNullOrWhiteSpace(payeeId))
            return "id:" + payeeId;

        string? canonicalPayee = TextPreprocessor.Normalize(payeeName);
        if (canonicalPayee != null)
            return "payee:" + canonicalPayee;

        string? importOriginal = TextPreprocessor.Normalize(importPayeeNameOriginal);
        if (importOriginal != null)
            return "import:" + importOriginal;

        return null;
    }

    private static string? IdentityKey(PeriodicHistoryTransaction transaction) =>
        IdentityKey(transaction.PayeeId, transaction.PayeeName, transaction.ImportPayeeNameOriginal);

    private static string? IdentityKey(PendingTransaction transaction) =>
        IdentityKey(transaction.PayeeId, transaction.PayeeName, transaction.ImportPayeeNameOriginal);

    private static PeriodicHistoryTransaction FromTraining(TrainingTransaction transaction) =>
        new(
            transaction.Id,
            transaction.ImportPayeeNameOriginal,
            transaction.PayeeName,
            transaction.PayeeId,
            transaction.CategoryName,
            transaction.Amount,
            transaction.Date);

    private static List<List<PeriodicHistoryTransaction>> ClusterByAmount(
        IReadOnlyList<PeriodicHistoryTransaction> transactions,
        PeriodicSeriesSettings settings)
    {
        var clusters = new List<List<PeriodicHistoryTransaction>>();

        foreach (PeriodicHistoryTransaction transaction in transactions.OrderBy(item => Math.Abs(item.Amount)))
        {
            List<PeriodicHistoryTransaction>? cluster = clusters.FirstOrDefault(candidate =>
                AmountFits(transaction.Amount, MedianAmount(candidate), settings));

            if (cluster == null)
            {
                clusters.Add([transaction]);
                continue;
            }

            cluster.Add(transaction);
        }

        return clusters;
    }

    private static bool TryBuildSeries(
        string identityKey,
        List<PeriodicHistoryTransaction> cluster,
        PeriodicSeriesSettings settings,
        out IndexedSeries series)
    {
        series = default!;

        if (cluster.Count < settings.MinOccurrences)
            return false;

        List<PeriodicHistoryTransaction> ordered = cluster.OrderBy(item => item.Date).ThenBy(item => item.Id).ToList();
        List<int> gaps = PositiveGaps(ordered);
        if (gaps.Count < 2)
            return false;

        if (!TryClassifyCadence(gaps, settings, out CadenceSpec cadence, out float matchRatio))
            return false;

        List<PeriodicHistoryTransaction> labeled = ordered
            .Where(item => !CategoryNormalizer.IsExcludedName(item.CategoryName))
            .ToList();

        string? category = labeled.Count == 0
            ? null
            : labeled
                .GroupBy(item => item.CategoryName!, StringComparer.OrdinalIgnoreCase)
                .Select(group => (Name: group.Key, Count: group.Count()))
                .OrderByDescending(group => group.Count)
                .First()
                .Name;

        float voteShare = labeled.Count == 0
            ? 0f
            : (float)labeled.Count(item =>
                string.Equals(item.CategoryName, category, StringComparison.OrdinalIgnoreCase)) / labeled.Count;

        series = new IndexedSeries(
            identityKey,
            cadence.Cadence,
            cadence.SlackDays,
            MedianAmount(ordered),
            Median(gaps),
            voteShare,
            matchRatio,
            category,
            ordered.Select(item => new SeriesMember(item.Id, item.Date, item.Amount, item.CategoryName)).ToList());

        return true;
    }

    private static List<int> PositiveGaps(IReadOnlyList<PeriodicHistoryTransaction> ordered)
    {
        var gaps = new List<int>();
        for (int index = 1; index < ordered.Count; index++)
        {
            int days = ordered[index].Date.DayNumber - ordered[index - 1].Date.DayNumber;
            if (days > 0)
                gaps.Add(days);
        }

        return gaps;
    }

    private static bool TryClassifyCadence(
        IReadOnlyList<int> gaps,
        PeriodicSeriesSettings settings,
        out CadenceSpec cadence,
        out float matchRatio)
    {
        cadence = Cadences[0];
        matchRatio = 0;
        CadenceSpec? best = null;
        float bestRatio = 0;
        int bestMatches = 0;

        foreach (CadenceSpec candidate in Cadences)
        {
            int matches = gaps.Count(gap => IntervalFits(gap, candidate.TypicalDays, candidate.SlackDays));
            float ratio = (float)matches / gaps.Count;
            if (ratio < settings.CadenceMatchRatio || matches < 2)
                continue;

            if (best != null
                && (ratio < bestRatio || (Math.Abs(ratio - bestRatio) < 0.0001f && matches <= bestMatches)))
            {
                continue;
            }

            best = candidate;
            bestRatio = ratio;
            bestMatches = matches;
        }

        if (best == null)
            return false;

        cadence = best.Value;
        matchRatio = bestRatio;
        return true;
    }

    private static bool IsOnCadence(
        DateOnly pendingDate,
        DateOnly lastDate,
        int medianIntervalDays,
        int slackDays,
        PeriodicSeriesSettings settings,
        out int dayError)
    {
        dayError = int.MaxValue;
        int daysSinceLast = pendingDate.DayNumber - lastDate.DayNumber;
        if (daysSinceLast <= 0 || medianIntervalDays <= 0)
            return false;

        double periodsExact = (double)daysSinceLast / medianIntervalDays;
        int periods = (int)Math.Round(periodsExact, MidpointRounding.AwayFromZero);
        if (periods < 1 || periods > settings.MaxMissedPeriods + 1)
            return false;

        int expectedDays = periods * medianIntervalDays;
        dayError = Math.Abs(daysSinceLast - expectedDays);
        return dayError <= slackDays;
    }

    private static PeriodicMatch ToMatch(
        IndexedSeries series,
        string pendingId,
        DateOnly lastDate,
        PeriodicSeriesSettings settings)
    {
        int cap = Math.Max(1, settings.RelatedTransactionIdCap);
        IReadOnlyList<string> relatedIds = series.Members
            .Where(member => member.Id != pendingId)
            .OrderByDescending(member => member.Date)
            .Take(cap)
            .Select(member => member.Id)
            .ToList();

        return new PeriodicMatch
        {
            Cadence = series.Cadence,
            OccurrenceCount = series.Members.Count,
            MedianAmount = series.MedianAmount,
            LastDate = lastDate,
            Category = series.Category,
            CategoryVoteShare = series.CategoryVoteShare,
            RelatedTransactionIds = relatedIds,
            CadenceFit = series.IntervalMatchRatio
        };
    }

    public static bool AmountFits(int leftMilliunits, int rightMilliunits, PeriodicSeriesSettings settings)
    {
        int leftSign = Math.Sign(leftMilliunits);
        int rightSign = Math.Sign(rightMilliunits);
        if (leftSign != 0 && rightSign != 0 && leftSign != rightSign)
            return false;

        int leftAbs = Math.Abs(leftMilliunits);
        int rightAbs = Math.Abs(rightMilliunits);
        int delta = Math.Abs(leftAbs - rightAbs);
        int relativeTolerance = (int)Math.Round(Math.Max(leftAbs, rightAbs) * (decimal)settings.AmountRelativeTolerance);
        int tolerance = Math.Max(settings.AmountAbsoluteToleranceMilliunits, relativeTolerance);
        return delta <= tolerance;
    }

    private static int MedianAmount(IReadOnlyList<PeriodicHistoryTransaction> transactions) =>
        Median(transactions.Select(item => item.Amount).ToList());

    private static int Median(IReadOnlyList<int> values)
    {
        List<int> sorted = values.OrderBy(value => value).ToList();
        int middle = sorted.Count / 2;
        if (sorted.Count % 2 == 1)
            return sorted[middle];

        return (int)Math.Round((sorted[middle - 1] + sorted[middle]) / 2d, MidpointRounding.AwayFromZero);
    }

    private static bool IntervalFits(int days, int typicalDays, int slackDays) =>
        Math.Abs(days - typicalDays) <= slackDays;

    private readonly record struct CadenceSpec(PeriodicCadence Cadence, int TypicalDays, int SlackDays);

    private sealed record SeriesMember(string Id, DateOnly Date, int Amount, string? CategoryName);

    private sealed record IndexedSeries(
        string IdentityKey,
        PeriodicCadence Cadence,
        int SlackDays,
        int MedianAmount,
        int MedianIntervalDays,
        float CategoryVoteShare,
        float IntervalMatchRatio,
        string? Category,
        IReadOnlyList<SeriesMember> Members);
}
