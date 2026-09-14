namespace YnabCategoryAi.ML.Models;

public class PayeeMappingInput
{
    public string ImportText { get; set; } = string.Empty;
    public string CanonicalPayee { get; set; } = string.Empty;
}

public class PayeeMappingPrediction
{
    public string PredictedLabel { get; set; } = string.Empty;
    public float[] Score { get; set; } = [];
}
