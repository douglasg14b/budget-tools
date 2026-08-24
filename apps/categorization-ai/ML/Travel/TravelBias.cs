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

        string? importText = transaction.ImportPayeeNameOriginal ?? transaction.ImportPayeeName;
        MerchantCityEvidence evidence = MerchantCity.Classify(window.Location, importText);
        return Rewrite(proposal, window, mapped, evidence, catalog, maxRankedOptions);
    }

    private static CategorizationProposal Rewrite(
        CategorizationProposal proposal,
        TravelWindowRecord window,
        CategoryInfo? mapped,
        MerchantCityEvidence evidence,
        CategoryCatalog catalog,
        int maxRankedOptions)
    {
        bool mismatch = evidence.LocationMatch == TravelLocationMatch.Mismatch;
        bool steer = mapped != null && !mismatch;
        string? originalCategory = proposal.SuggestedCategory;
        bool alreadyMapped = mapped != null
            && originalCategory != null
            && string.Equals(mapped.Name, originalCategory, StringComparison.OrdinalIgnoreCase);

        IReadOnlyList<CategoryOptionDto> options = proposal.Options;
        if (mapped != null && steer && !alreadyMapped)
        {
            options = PromoteMappedOption(proposal.Options, mapped, originalCategory, catalog, maxRankedOptions);
        }
        else if (mapped != null && mismatch && !alreadyMapped)
        {
            options = InsertMappedAfterFirst(proposal.Options, mapped, maxRankedOptions);
        }
        else if (mapped != null)
        {
            options = TagMappedOption(proposal.Options, mapped, proposal.Confidence);
        }

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
            SuggestedCategory = steer && mapped != null ? mapped.Name : proposal.SuggestedCategory,
            SuggestedCategoryGroup = steer && mapped != null ? mapped.GroupName : proposal.SuggestedCategoryGroup,
            SuggestedCategoryId = steer && mapped != null ? mapped.Id : proposal.SuggestedCategoryId,
            Confidence = proposal.Confidence,
            Method = proposal.Method,
            RouteReason = proposal.RouteReason,
            GapReason = proposal.GapReason,
            Signals = AppendTravelSignal(proposal.Signals, mapped?.Name ?? originalCategory ?? window.Name, proposal.Confidence),
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
                mapped?.Name,
                window.Location,
                evidence.LocationMatch,
                evidence.MerchantCity)
        };
    }

    private static IReadOnlyList<CategoryOptionDto> PromoteMappedOption(
        IReadOnlyList<CategoryOptionDto> existing,
        CategoryInfo mapped,
        string? originalCategory,
        CategoryCatalog catalog,
        int maxRankedOptions)
    {
        CategoryOptionDto mappedOption = WithTravelSupport(
            existing.FirstOrDefault(option => SameCategory(option, mapped.Name, mapped.Id))
            ?? new CategoryOptionDto(
                Rank: 1,
                Category: mapped.Name,
                CategoryGroup: mapped.GroupName,
                CategoryId: mapped.Id,
                Confidence: existing.FirstOrDefault()?.Confidence ?? 0,
                SupportingMethods: []),
            mapped);

        CategoryOptionDto? originalOption = originalCategory == null
            ? null
            : existing.FirstOrDefault(option => SameCategory(option, originalCategory, categoryId: null));

        if (originalOption == null && originalCategory != null)
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
                && (originalCategory == null || !SameCategory(option, originalCategory, categoryId: null)))
            .ToList();

        int reserved = originalOption == null ? 1 : 2;
        int remainingSlots = Math.Max(0, maxRankedOptions - reserved);
        List<CategoryOptionDto> combined = originalOption == null
            ? [mappedOption, .. rest.Take(remainingSlots)]
            : [mappedOption, originalOption, .. rest.Take(remainingSlots)];

        return combined
            .Select((option, index) => option with { Rank = index + 1 })
            .ToList();
    }

    private static IReadOnlyList<CategoryOptionDto> InsertMappedAfterFirst(
        IReadOnlyList<CategoryOptionDto> existing,
        CategoryInfo mapped,
        int maxRankedOptions)
    {
        CategoryOptionDto mappedOption = WithTravelSupport(
            existing.FirstOrDefault(option => SameCategory(option, mapped.Name, mapped.Id))
            ?? new CategoryOptionDto(
                Rank: 2,
                Category: mapped.Name,
                CategoryGroup: mapped.GroupName,
                CategoryId: mapped.Id,
                Confidence: existing.FirstOrDefault()?.Confidence ?? 0,
                SupportingMethods: []),
            mapped);

        if (existing.Count == 0)
            return [mappedOption with { Rank = 1 }];

        CategoryOptionDto first = existing[0];
        if (SameCategory(first, mapped.Name, mapped.Id))
            return TagMappedOption(existing, mapped, mappedOption.Confidence);

        var rest = existing.Skip(1)
            .Where(option => !SameCategory(option, mapped.Name, mapped.Id))
            .ToList();
        int remainingSlots = Math.Max(0, maxRankedOptions - 2);
        List<CategoryOptionDto> combined = [first, mappedOption, .. rest.Take(remainingSlots)];

        return combined
            .Select((option, index) => option with { Rank = index + 1 })
            .ToList();
    }

    private static IReadOnlyList<CategoryOptionDto> TagMappedOption(
        IReadOnlyList<CategoryOptionDto> existing,
        CategoryInfo mapped,
        float confidence)
    {
        return existing
            .Select(option =>
                SameCategory(option, mapped.Name, mapped.Id)
                    ? WithTravelSupport(option, mapped, confidence)
                    : option)
            .ToList();
    }

    private static IReadOnlyList<MethodSignalDto> AppendTravelSignal(
        IReadOnlyList<MethodSignalDto> signals,
        string category,
        float confidence)
    {
        if (signals.Any(signal => signal.Method == CategorizationMethod.TravelWindow))
            return signals;

        return [.. signals, new MethodSignalDto(CategorizationMethod.TravelWindow, category, confidence)];
    }

    private static CategoryOptionDto WithTravelSupport(
        CategoryOptionDto option,
        CategoryInfo mapped,
        float? confidence = null)
    {
        if (option.SupportingMethods.Any(signal => signal.Method == CategorizationMethod.TravelWindow))
            return option;

        return option with
        {
            SupportingMethods =
            [
                .. option.SupportingMethods,
                new MethodSignalDto(CategorizationMethod.TravelWindow, mapped.Name, confidence ?? option.Confidence)
            ]
        };
    }

    private static bool SameCategory(CategoryOptionDto option, string name, string? categoryId) =>
        (categoryId != null && option.CategoryId == categoryId)
        || string.Equals(option.Category, name, StringComparison.OrdinalIgnoreCase);
}
