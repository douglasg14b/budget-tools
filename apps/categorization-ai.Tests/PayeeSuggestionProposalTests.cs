using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class PayeeSuggestionProposalTests
{
    [Fact]
    public void MarksARawImportPayeeAsNeedingRename()
    {
        PendingTransaction transaction = new(
            "tx-1",
            "SQ *STUMPTOWN COFFEE PORTLAND OR",
            "Sq *Stumptown Coffee Portland Or",
            "SQ *STUMPTOWN COFFEE PORTLAND OR",
            "payee-raw",
            -4500,
            "Checking",
            null,
            new DateOnly(2024, 6, 1));

        CategorizationProposal proposal = CategorizationProposalBuilder.BuildExcluded(
            transaction,
            "sq stumptown coffee portland or",
            ExclusionKind.Payee,
            new PayeeResolutionResult(PayeeResolutionMethod.ExactLookup, "Stumptown", 1f));

        Assert.Equal("Stumptown", proposal.ResolvedPayee);
        Assert.NotNull(proposal.PayeeSuggestion);
        Assert.Equal("Stumptown", proposal.PayeeSuggestion.Name);
        Assert.Equal(PayeeResolutionMethod.ExactLookup, proposal.PayeeSuggestion.Method);
        Assert.True(proposal.PayeeSuggestion.NeedsRename);
    }

    [Fact]
    public void DoesNotFlagRenameWhenTheCurrentPayeeIsAlreadyCanonical()
    {
        PendingTransaction transaction = new(
            "tx-2",
            "SAFEWAY #1827 LA GRANDE OR",
            "Safeway #1827 La Grande Or",
            "Safeway",
            "payee-safeway",
            -32000,
            "Checking",
            null,
            new DateOnly(2024, 6, 1));

        CategorizationProposal proposal = CategorizationProposalBuilder.BuildExcluded(
            transaction,
            "safeway 1827 la grande or",
            ExclusionKind.Payee,
            new PayeeResolutionResult(PayeeResolutionMethod.ExactLookup, "Safeway", 1f));

        Assert.Equal("Safeway", proposal.ResolvedPayee);
        Assert.NotNull(proposal.PayeeSuggestion);
        Assert.False(proposal.PayeeSuggestion.NeedsRename);
    }

    [Fact]
    public void LeavesPayeeSuggestionUnsetWhenUnresolved()
    {
        PendingTransaction transaction = new(
            "tx-3",
            "UNKNOWN MERCHANT 99",
            "Unknown Merchant 99",
            "UNKNOWN MERCHANT 99",
            null,
            -1200,
            "Checking",
            null,
            new DateOnly(2024, 6, 1));

        CategorizationProposal proposal = CategorizationProposalBuilder.BuildExcluded(
            transaction,
            "unknown merchant 99",
            ExclusionKind.Payee,
            new PayeeResolutionResult(PayeeResolutionMethod.Unresolved, null, 0f));

        Assert.Equal("UNKNOWN MERCHANT 99", proposal.ResolvedPayee);
        Assert.Null(proposal.PayeeSuggestion);
    }
}
