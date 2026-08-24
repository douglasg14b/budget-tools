using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Travel;

public static class TravelBias
{
    public static CategorizationProposal Apply(
        CategorizationProposal proposal,
        PendingTransaction transaction,
        bool enabled,
        IReadOnlyList<TravelWindowRecord> windows,
        CategoryCatalog catalog,
        int maxRankedOptions)
    {
        if (!enabled || windows.Count == 0 || proposal.Flags.IsExcluded)
            return proposal;

        TravelWindowRecord? window = TravelWindowMatcher.Match(transaction, proposal.PeriodicMatch, windows);
        if (window == null)
            return proposal;

        CategoryInfo? mapped = window.Kind.Equals("work", StringComparison.OrdinalIgnoreCase)
            ? VacationCategoryMapper.MapWork(catalog)
            : VacationCategoryMapper.MapVacation(proposal.SuggestedCategory ?? string.Empty, catalog);

        return Rewrite(proposal, window, mapped, catalog, maxRankedOptions);
    }

    private static CategorizationProposal Rewrite(
        CategorizationProposal proposal,
        TravelWindowRecord window,
        CategoryInfo? mapped,
        CategoryCatalog catalog,
        int maxRankedOptions)
    {
        string? originalCategory = proposal.SuggestedCategory;
        bool promote = mapped != null
            && originalCategory != null
            && !string.Equals(mapped.Name, originalCategory, StringComparison.OrdinalIgnoreCase);

        IReadOnlyList<CategoryOptionDto> options = promote
            ? PromoteMappedOption(proposal.Options, mapped!, originalCategory!, catalog, maxRankedOptions)
            : proposal.Options;

        return new CategorizationProposal
        {
            TransactionId = proposal.TransactionId,
            Tier = proposal.Tier,
            Flags = new CategorizationFlags
            {
                IsAmbiguous = proposal.Flags.IsAmbiguous,
                IsNovelImport = proposal.Flags.IsNovelImport,
                IsExcluded = proposal.Flags.IsExcluded,
                RequiresManualReview = proposal.Flags.RequiresManualReview,
                IsPeriodic = proposal.Flags.IsPeriodic,
                IsPeriodicConflict = proposal.Flags.IsPeriodicConflict,
                IsTravelWindow = true
            },
            SuggestedCategory = promote ? mapped!.Name : proposal.SuggestedCategory,
            SuggestedCategoryGroup = promote ? mapped!.GroupName : proposal.SuggestedCategoryGroup,
            SuggestedCategoryId = promote ? mapped!.Id : proposal.SuggestedCategoryId,
            Confidence = proposal.Confidence,
            Method = proposal.Method,
            RouteReason = proposal.RouteReason,
            GapReason = proposal.GapReason,
            Signals = proposal.Signals,
            AgreeingSignals = proposal.AgreeingSignals,
            Options = options,
            ConfidenceInterval = proposal.ConfidenceInterval,
            FeatureText = proposal.FeatureText,
            ResolvedPayee = proposal.ResolvedPayee,
            PayeeSuggestion = proposal.PayeeSuggestion,
            Notes = proposal.Notes,
            PeriodicMatch = proposal.PeriodicMatch,
            TravelWindow = new TravelWindowHitDto(
                window.Id,
                window.Name,
                window.Kind,
                mapped?.Name)
        };
    }

    private static IReadOnlyList<CategoryOptionDto> PromoteMappedOption(
        IReadOnlyList<CategoryOptionDto> existing,
        CategoryInfo mapped,
        string originalCategory,
        CategoryCatalog catalog,
        int maxRankedOptions)
    {
        CategoryOptionDto mappedOption = existing.FirstOrDefault(option =>
            SameCategory(option, mapped.Name, mapped.Id))
            ?? new CategoryOptionDto(
                Rank: 1,
                Category: mapped.Name,
                CategoryGroup: mapped.GroupName,
                CategoryId: mapped.Id,
                Confidence: existing.FirstOrDefault()?.Confidence ?? 0,
                SupportingMethods: []);

        CategoryOptionDto? originalOption = existing.FirstOrDefault(option =>
            SameCategory(option, originalCategory, categoryId: null));

        if (originalOption == null)
        {
            catalog.TryResolveCategory(originalCategory, out CategoryInfo originalInfo);
            originalOption = new CategoryOptionDto(
                Rank: 2,
                Category: originalCategory,
                CategoryGroup: originalInfo?.GroupName,
                CategoryId: originalInfo?.Id,
                Confidence: mappedOption.Confidence,
                SupportingMethods: []);
        }

        var rest = existing
            .Where(option =>
                !SameCategory(option, mapped.Name, mapped.Id)
                && !SameCategory(option, originalCategory, categoryId: null))
            .ToList();

        int remainingSlots = Math.Max(0, maxRankedOptions - 2);
        List<CategoryOptionDto> combined = [mappedOption, originalOption, .. rest.Take(remainingSlots)];

        return combined
            .Select((option, index) => option with { Rank = index + 1 })
            .ToList();
    }

    private static bool SameCategory(CategoryOptionDto option, string name, string? categoryId) =>
        (categoryId != null && option.CategoryId == categoryId)
        || string.Equals(option.Category, name, StringComparison.OrdinalIgnoreCase);
}
