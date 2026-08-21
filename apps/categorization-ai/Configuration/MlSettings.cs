namespace YnabCategoryAi.Configuration;

public class MlSettings
{
    public float ConfidenceThreshold { get; set; } = 0.85f;
    public float LookupVoteShareThreshold { get; set; } = 0.80f;
    public float AmbiguousPayeeVoteShareThreshold { get; set; } = 0.95f;
    public string CategoryModelPath { get; set; } = "models/category-model.zip";
    public string PayeeModelPath { get; set; } = "models/payee-model.zip";
    public string ExportCsvPath { get; set; } = "data.csv";
    public float ValidationHoldoutFraction { get; set; } = 0.15f;
    public int MinCategoryTrainingExamples { get; set; } = 5;
    public string GroupModelPath { get; set; } = "models/group-model.zip";
    public ConsensusSettings Consensus { get; set; } = new();
    public AmbiguitySettings Ambiguity { get; set; } = new();
    public PayeeResolutionSettings PayeeResolution { get; set; } = new();

    /// <summary>Minimum confidence for a category to appear in ranked Options (default 0.75).</summary>
    public float OptionConfidenceFloor { get; set; } = 0.75f;

    /// <summary>Max ranked category options returned per transaction (default 5).</summary>
    public int MaxRankedOptions { get; set; } = 5;
}
