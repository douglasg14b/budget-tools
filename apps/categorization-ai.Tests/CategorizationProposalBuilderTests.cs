using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class CategorizationProposalBuilderTests
{
    private static readonly CategoryCatalog Catalog = CategoryCatalog.FromCategories(
    [
        new CategoryInfo { Id = "vac-coffee", Name = "Vacation - Coffee", GroupId = "vac", GroupName = "Vacation" },
        new CategoryInfo { Id = "snacks", Name = "Food - Snacks", GroupId = "food", GroupName = "Food" },
    ]);

    [Fact]
    public void ReviewItemWithNoQualifiedSignalsDoesNotBorrowTheTopOptionsConfidence()
    {
        CategorizationProposal proposal = Build(
            isAmbiguous: true,
            new MethodSignal(CategorizationMethod.CanonicalPayeeLookup, "Vacation - Coffee", 1f));

        Assert.Equal(ProposalGapReason.NoQualifiedSignals, proposal.GapReason);
        Assert.Equal("Vacation - Coffee", proposal.SuggestedCategory);
        Assert.Equal(1f, proposal.Options[0].Confidence);
        Assert.Equal(0f, proposal.Confidence);
    }

    [Fact]
    public void QualifiedSuggestionKeepsItsOwnConfidence()
    {
        CategorizationProposal proposal = Build(
            isAmbiguous: false,
            new MethodSignal(CategorizationMethod.HierarchicalModel, "Food - Snacks", 0.95f),
            new MethodSignal(CategorizationMethod.CategoryModel, "Food - Snacks", 0.93f));

        Assert.Equal("Food - Snacks", proposal.SuggestedCategory);
        Assert.Equal(0.94f, proposal.Confidence, precision: 4);
    }

    private static CategorizationProposal Build(bool isAmbiguous, params MethodSignal[] signals) =>
        CategorizationProposalBuilder.BuildFromPipelineState(
            new PendingTransaction(
                "tx-1",
                "Sq *the Local La Grande Or",
                "The Local",
                "The Local",
                "payee-local",
                -8250,
                "Checking",
                null,
                new DateOnly(2026, 10, 7)),
            "sq the local la grande or",
            signals,
            isAmbiguous,
            isNovelImport: false,
            new MlSettings(),
            Catalog,
            gotConsensus: false,
            consensusCategory: null,
            agreeingSignals: [],
            consensusConfidence: 0f,
            llmResult: null);
}
