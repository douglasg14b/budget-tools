using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Travel;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class TravelBiasTests
{
    [Fact]
    public void PromotesVacationCoffeeAndKeepsOriginalCoffeeAsAnOption()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee"), Option(2, "Dining", "Everyday", "dining")],
            kind: "vacation");

        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.SuggestedCategory);
        Assert.Equal(ApprovalTier.Review, rewritten.Tier);
        Assert.True(rewritten.Flags.IsTravelWindow);
        Assert.Equal("Coffee", rewritten.Options[1].Category);
        Assert.Equal("Coffee", rewritten.Signals[0].Category);
        Assert.Contains(rewritten.Signals, signal => signal.Method == CategorizationMethod.TravelWindow);
        Assert.Contains(rewritten.Options[0].SupportingMethods, signal => signal.Method == CategorizationMethod.TravelWindow);
        Assert.DoesNotContain(rewritten.Options, option => option.Category == "🌴☕ Vacation - Coffee" && option.Rank != 1);
    }

    [Fact]
    public void WorkAutoApplyCoffeeBecomesTransientAndCoffeeRemainsAnOption()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee")],
            kind: "work",
            tier: ApprovalTier.AutoApply);

        Assert.Equal(ApprovalTier.AutoApply, rewritten.Tier);
        Assert.Equal("🔄 Transient / Reimbursable", rewritten.SuggestedCategory);
        Assert.Contains(rewritten.Options, option => option.Category == "Coffee" && option.Rank > 1);
        Assert.Equal("Coffee", rewritten.Signals[0].Category);
    }

    [Fact]
    public void DisagreementStaysReviewAfterPromotion()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee"), Option(2, "Dining", "Everyday", "dining")],
            kind: "vacation",
            tier: ApprovalTier.Review);

        Assert.Equal(ApprovalTier.Review, rewritten.Tier);
        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.SuggestedCategory);
        Assert.Equal("Coffee", rewritten.Options[1].Category);
    }

    [Fact]
    public void UnmatchedVacationTailKeepsOriginalWinnerAndStillAttachesTheWindow()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Pharmacy",
            options: [Option(1, "Pharmacy", "Everyday", "pharmacy")],
            kind: "vacation");

        Assert.Equal("Pharmacy", rewritten.SuggestedCategory);
        Assert.True(rewritten.Flags.IsTravelWindow);
        Assert.Null(rewritten.TravelWindow?.TargetCategory);
    }

    [Fact]
    public void SkipsRewriteWhenDisabled()
    {
        CategorizationProposal original = Proposal("Coffee", [Option(1, "Coffee", "Everyday", "coffee")]);
        TravelWindowRecord window = Window("vacation");

        CategorizationProposal rewritten = TravelBias.Apply(
            original,
            Pending(),
            enabled: false,
            [window],
            VacationCategoryMapperTests.Catalog(),
            maxRankedOptions: 5);

        Assert.Equal("Coffee", rewritten.SuggestedCategory);
        Assert.False(rewritten.Flags.IsTravelWindow);
        Assert.Null(rewritten.TravelWindow);
    }

    [Fact]
    public void SkipsRewriteForPeriodicAndInflow()
    {
        TravelWindowRecord window = Window("vacation");
        CategorizationProposal original = Proposal("Coffee", [Option(1, "Coffee", "Everyday", "coffee")]);

        CategorizationProposal periodic = TravelBias.Apply(
            Proposal("Coffee", [Option(1, "Coffee", "Everyday", "coffee")], periodic: Periodic()),
            Pending(amount: -12000),
            enabled: true,
            [window],
            VacationCategoryMapperTests.Catalog(),
            maxRankedOptions: 5);

        CategorizationProposal inflow = TravelBias.Apply(
            original,
            Pending(amount: 4000),
            enabled: true,
            [window],
            VacationCategoryMapperTests.Catalog(),
            maxRankedOptions: 5);

        Assert.Equal("Coffee", periodic.SuggestedCategory);
        Assert.False(periodic.Flags.IsTravelWindow);
        Assert.Equal("Coffee", inflow.SuggestedCategory);
        Assert.False(inflow.Flags.IsTravelWindow);
    }

    [Fact]
    public void MissingTransientCategoryFailsThePredictRun()
    {
        CategoryCatalog catalog = CategoryCatalog.FromCategories(
        [
            new CategoryInfo { Id = "coffee", Name = "Coffee", GroupId = "home", GroupName = "Everyday" },
        ]);
        CategorizationProposal original = Proposal("Coffee", [Option(1, "Coffee", "Everyday", "coffee")]);

        Assert.Throws<InvalidOperationException>(() =>
            TravelBias.Apply(
                original,
                Pending(),
                enabled: true,
                [Window("work")],
                catalog,
                maxRankedOptions: 5));
    }

    [Fact]
    public void NeverDropsTheOriginalWinnerWhenTheOptionListIsFull()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options:
            [
                Option(1, "Coffee", "Everyday", "coffee"),
                Option(2, "Dining", "Everyday", "dining"),
                Option(3, "Groceries", "Everyday", "groceries"),
            ],
            kind: "vacation",
            maxRankedOptions: 2);

        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.Options[0].Category);
        Assert.Equal("Coffee", rewritten.Options[1].Category);
        Assert.Equal(2, rewritten.Options.Count);
    }

    [Fact]
    public void MatchPromotesMappedCategoryAndRecordsCityEvidence()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee")],
            kind: "vacation",
            location: "Nashville",
            importOriginal: "SQ *COFFEE NASHVILLE TN");

        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.SuggestedCategory);
        Assert.True(rewritten.Flags.IsTravelWindow);
        Assert.Equal(TravelLocationMatch.Match, rewritten.TravelWindow?.LocationMatch);
        Assert.Equal("NASHVILLE", rewritten.TravelWindow?.MerchantCity);
        Assert.Equal("Nashville", rewritten.TravelWindow?.Location);
        Assert.Contains(rewritten.Signals, signal => signal.Method == CategorizationMethod.TravelWindow);
        Assert.Contains(rewritten.Options[0].SupportingMethods, signal => signal.Method == CategorizationMethod.TravelWindow);
    }

    [Fact]
    public void MismatchKeepsMlWinnerAndInsertsTripCategoryAsAShortcut()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee"), Option(2, "Dining", "Everyday", "dining")],
            kind: "vacation",
            location: "Nashville",
            importOriginal: "SAFEWAY SEATTLE WA");

        Assert.Equal("Coffee", rewritten.SuggestedCategory);
        Assert.Equal(CategorizationMethod.ImportAmountLookup, rewritten.Method);
        Assert.True(rewritten.Flags.IsTravelWindow);
        Assert.Equal(TravelLocationMatch.Mismatch, rewritten.TravelWindow?.LocationMatch);
        Assert.Equal("SEATTLE", rewritten.TravelWindow?.MerchantCity);
        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.Options[1].Category);
        Assert.Contains(rewritten.Options[1].SupportingMethods, signal => signal.Method == CategorizationMethod.TravelWindow);
        Assert.Contains(rewritten.Signals, signal => signal.Method == CategorizationMethod.TravelWindow);
    }

    [Fact]
    public void UnknownCityStillSteersToTheMappedTripCategory()
    {
        CategorizationProposal rewritten = Apply(
            suggestion: "Coffee",
            options: [Option(1, "Coffee", "Everyday", "coffee")],
            kind: "vacation",
            location: "Nashville",
            importOriginal: "AMAZON.COM AMZN.COM/BILL");

        Assert.Equal("🌴☕ Vacation - Coffee", rewritten.SuggestedCategory);
        Assert.Equal(TravelLocationMatch.Unknown, rewritten.TravelWindow?.LocationMatch);
        Assert.True(rewritten.Flags.IsTravelWindow);
    }

    private static CategorizationProposal Apply(
        string suggestion,
        IReadOnlyList<CategoryOptionDto> options,
        string kind,
        ApprovalTier tier = ApprovalTier.Review,
        int maxRankedOptions = 5,
        string? location = null,
        string importOriginal = "SQ *COFFEE") =>
        TravelBias.Apply(
            Proposal(suggestion, options, tier),
            Pending(importOriginal: importOriginal),
            enabled: true,
            [Window(kind, location)],
            VacationCategoryMapperTests.Catalog(),
            maxRankedOptions);

    private static CategorizationProposal Proposal(
        string suggestion,
        IReadOnlyList<CategoryOptionDto> options,
        ApprovalTier tier = ApprovalTier.Review,
        PeriodicMatch? periodic = null) =>
        new()
        {
            TransactionId = "tx-1",
            Tier = tier,
            Flags = new CategorizationFlags { RequiresManualReview = tier != ApprovalTier.AutoApply },
            SuggestedCategory = suggestion,
            SuggestedCategoryGroup = "Everyday",
            SuggestedCategoryId = suggestion.ToLowerInvariant(),
            Confidence = 0.99f,
            Method = CategorizationMethod.ImportAmountLookup,
            RouteReason = CategorizationRouteReason.None,
            GapReason = ProposalGapReason.None,
            Signals = [new MethodSignalDto(CategorizationMethod.ImportAmountLookup, suggestion, 0.99f)],
            AgreeingSignals = [new MethodSignalDto(CategorizationMethod.ImportAmountLookup, suggestion, 0.99f)],
            Options = options,
            FeatureText = "SQ *COFFEE",
            PeriodicMatch = periodic
        };

    private static CategoryOptionDto Option(int rank, string category, string group, string id) =>
        new(rank, category, group, id, 0.99f, []);

    private static TravelWindowRecord Window(string kind, string? location = null) =>
        new(Guid.NewGuid(), kind == "work" ? "Austin client" : "Hawaii", kind,
            new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 10), location, []);

    private static PendingTransaction Pending(int amount = -12000, string importOriginal = "SQ *COFFEE") =>
        new(
            "tx-1",
            importOriginal,
            "Coffee",
            "Coffee",
            "payee-1",
            amount,
            "Visa",
            null,
            new DateOnly(2026, 7, 5),
            "card-a");

    private static PeriodicMatch Periodic() =>
        new()
        {
            Cadence = PeriodicCadence.Monthly,
            OccurrenceCount = 8,
            MedianAmount = -12000,
            LastDate = new DateOnly(2026, 6, 1),
            Category = "Streaming",
            CategoryVoteShare = 1,
            RelatedTransactionIds = ["tx-a"],
            CadenceFit = 1
        };
}
