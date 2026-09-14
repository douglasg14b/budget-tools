namespace YnabCategoryAi.ML.Models;

public class CategoryClassificationInput
{
    public string FeatureText { get; set; } = string.Empty;
    public string CategoryName { get; set; } = string.Empty;
    public float Amount { get; set; }
    public string AccountName { get; set; } = string.Empty;
}

public class CategoryClassificationPrediction
{
    public string PredictedLabel { get; set; } = string.Empty;
    public float[] Score { get; set; } = [];
}
