using YnabCategoryAi.ML.Travel;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class MerchantCityTests
{
    [Theory]
    [InlineData("STARBUCKS NASHVILLE TN", "NASHVILLE")]
    [InlineData("UBER *TRIP SAN FRANCISCO CA", "SAN FRANCISCO")]
    [InlineData("SAFEWAY SEATTLE WA", "SEATTLE")]
    [InlineData("AMAZON.COM", null)]
    [InlineData("SQ *COFFEE", null)]
    public void ExtractsCityStateSuffix(string import, string? expected)
    {
        Assert.Equal(expected, MerchantCity.ExtractCity(import));
    }

    [Fact]
    public void UnspecifiedWhenTheTripHasNoDestination()
    {
        MerchantCityEvidence evidence = MerchantCity.Classify(null, "STARBUCKS NASHVILLE TN");
        Assert.Equal(TravelLocationMatch.Unspecified, evidence.LocationMatch);
        Assert.Equal("NASHVILLE", evidence.MerchantCity);
    }

    [Theory]
    [InlineData("Nashville", "STARBUCKS NASHVILLE TN")]
    [InlineData("Nashville, TN", "STARBUCKS STORE 12 NASHVILLE TN")]
    [InlineData("San Francisco", "UBER *TRIP SAN FRANCISCO CA")]
    public void MatchWhenImportContainsTheDestination(string destination, string import)
    {
        MerchantCityEvidence evidence = MerchantCity.Classify(destination, import);
        Assert.Equal(TravelLocationMatch.Match, evidence.LocationMatch);
        Assert.NotNull(evidence.MerchantCity);
    }

    [Fact]
    public void MismatchWhenImportHasADifferentCitySuffix()
    {
        MerchantCityEvidence evidence = MerchantCity.Classify("Nashville", "SAFEWAY SEATTLE WA");
        Assert.Equal(TravelLocationMatch.Mismatch, evidence.LocationMatch);
        Assert.Equal("SEATTLE", evidence.MerchantCity);
    }

    [Fact]
    public void UnknownWhenNoCityIsParsedAndDestinationIsAbsent()
    {
        MerchantCityEvidence evidence = MerchantCity.Classify("Nashville", "AMAZON.COM AMZN.COM/BILL");
        Assert.Equal(TravelLocationMatch.Unknown, evidence.LocationMatch);
        Assert.Null(evidence.MerchantCity);
    }
}
