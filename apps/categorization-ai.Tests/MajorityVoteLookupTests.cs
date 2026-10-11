using YnabCategoryAi.ML.Lookup;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class MajorityVoteLookupTests
{
    [Fact]
    public void ReportsRawVoteShareWithoutASamplePrior()
    {
        var lookup = new MajorityVoteLookup();
        lookup.Add("the local station", "Vacation - Coffee");
        lookup.Add("the local station", "Vacation - Coffee");

        Assert.True(lookup.TryPredict("the local station", 0f, out LookupPrediction prediction));
        Assert.Equal(1f, prediction.Confidence);
        Assert.Equal(2, prediction.SampleCount);
    }

    [Fact]
    public void ShrinksConfidenceForSmallSamples()
    {
        var few = new MajorityVoteLookup { SamplePrior = 1f };
        few.Add("the local station", "Vacation - Coffee", 0.03f);
        few.Add("the local station", "Vacation - Coffee", 0.03f);

        var many = new MajorityVoteLookup { SamplePrior = 1f };
        for (int i = 0; i < 50; i++)
            many.Add("netflix", "Streaming");

        Assert.True(few.TryPredict("the local station", 0f, out LookupPrediction fewPrediction));
        Assert.True(many.TryPredict("netflix", 0f, out LookupPrediction manyPrediction));

        Assert.Equal(2f / 3f, fewPrediction.Confidence, precision: 4);
        Assert.Equal(50f / 51f, manyPrediction.Confidence, precision: 4);
    }

    [Fact]
    public void AppliesTheMinimumToTheShrunkConfidence()
    {
        var lookup = new MajorityVoteLookup { SamplePrior = 1f };
        lookup.Add("the local station", "Vacation - Coffee");
        lookup.Add("the local station", "Vacation - Coffee");

        Assert.False(lookup.TryPredict("the local station", 0.75f, out _));
    }

    [Fact]
    public void LeavesTheRawDistributionUnshrunk()
    {
        var lookup = new MajorityVoteLookup { SamplePrior = 1f };
        lookup.Add("the local station", "Vacation - Coffee");

        Assert.True(lookup.TryGetDistribution("the local station", out VoteDistribution distribution, out _));
        Assert.Equal(1f, distribution.TopVoteShare);
    }
}
