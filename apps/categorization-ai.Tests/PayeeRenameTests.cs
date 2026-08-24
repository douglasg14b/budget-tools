using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class PayeeRenameTests
{
    [Fact]
    public void NeedsRenameWhenCurrentPayeeIsTheBankImportString()
    {
        Assert.True(PayeeRename.NeedsRename(
            currentPayee: "SQ *STUMPTOWN COFFEE PORTLAND OR",
            suggestedPayee: "Stumptown",
            importOriginal: "SQ *STUMPTOWN COFFEE PORTLAND OR",
            importPayee: "Sq *Stumptown Coffee Portland Or"));
    }

    [Fact]
    public void DoesNotRenameWhenCurrentPayeeIsAlreadyCanonical()
    {
        Assert.False(PayeeRename.NeedsRename(
            currentPayee: "Stumptown",
            suggestedPayee: "Stumptown",
            importOriginal: "SQ *STUMPTOWN COFFEE PORTLAND OR",
            importPayee: "Stumptown"));
    }

    [Fact]
    public void DoesNotOverwriteAPayeeThatAlreadyDiffersFromTheImport()
    {
        Assert.False(PayeeRename.NeedsRename(
            currentPayee: "Stumptown",
            suggestedPayee: "Starbucks",
            importOriginal: "SQ *STUMPTOWN COFFEE PORTLAND OR",
            importPayee: "Sq *Stumptown Coffee Portland Or"));
    }

    [Fact]
    public void TreatsMissingPayeeAsNeedingAName()
    {
        Assert.True(PayeeRename.NeedsRename(
            currentPayee: null,
            suggestedPayee: "Netflix",
            importOriginal: "NETFLIX.COM",
            importPayee: "Netflix.com"));
    }

    [Fact]
    public void TreatsPunctuationOnlyDifferencesAsTheSamePayee()
    {
        Assert.True(PayeeRename.IsSamePayee("Safeway", "SAFEWAY"));
        Assert.True(PayeeRename.IsSamePayee("Joe's Coffee", "Joes Coffee"));
        Assert.False(PayeeRename.IsSamePayee("Safeway", "Safeway #1827"));
    }

    [Fact]
    public void LooksLikeImportWhenNormalizedNamesMatch()
    {
        Assert.True(PayeeRename.LooksLikeImportName(
            "Safeway #1827 La Grande Or",
            "SAFEWAY #1827 LA GRANDE OR",
            "Safeway"));
    }

    [Fact]
    public void DoesNotLookLikeImportWhenPayeeIsAShortCanonicalName()
    {
        Assert.False(PayeeRename.LooksLikeImportName(
            "Safeway",
            "SAFEWAY #1827 LA GRANDE OR",
            "Safeway #1827 La Grande Or"));
    }

    [Fact]
    public void DoesNotTreatYnabsCleanedImportPayeeAsRawWhenOriginalIsLonger()
    {
        Assert.False(PayeeRename.NeedsRename(
            currentPayee: "Proton Ag",
            suggestedPayee: "Frgn Trans Fee-proton Ag* Proton Ag Ge",
            importOriginal: "FRGN TRANS FEE-PROTON AG* PROTON AG GE",
            importPayee: "Proton Ag"));
    }

    [Fact]
    public void DoesNotRenameTowardADirtierBankString()
    {
        Assert.False(PayeeRename.NeedsRename(
            currentPayee: "Proton Ag",
            suggestedPayee: "Frgn Trans Fee-proton Ag* Proton Ag Ge",
            importOriginal: "FRGN TRANS FEE-PROTON AG* PROTON AG GE",
            importPayee: "FRGN TRANS FEE-PROTON AG* PROTON AG GE"));
    }
}
