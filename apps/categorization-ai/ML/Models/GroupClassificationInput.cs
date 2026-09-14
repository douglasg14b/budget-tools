namespace YnabCategoryAi.ML.Models;

public class GroupClassificationInput
{
    public string FeatureText { get; set; } = string.Empty;
    public string CategoryGroupName { get; set; } = string.Empty;
    public float Amount { get; set; }
    public string AccountName { get; set; } = string.Empty;
}

public class GroupClassificationPrediction
{
    public string PredictedLabel { get; set; } = string.Empty;
    public float[] Score { get; set; } = [];
}
