using YnabCategoryAi.ML;

namespace YnabCategoryAi.Configuration;

public class ConsensusSettings
{
    public float ConfidenceThreshold { get; set; } = 0.90f;

    public int MinAgreeingMethods { get; set; } = 3;

    public int MinAgreeingMethodsWithStrongSignal { get; set; } = 2;

    public float ImportAmountSoloThreshold { get; set; } = 0.98f;

    public bool AllowStrongSignalPair { get; set; } = false;

    /// <summary>Only these methods may form or join consensus. When empty, ExcludedMethods is used instead.</summary>
    public CategorizationMethod[] EligibleMethods { get; set; } = [];

    public CategorizationMethod[] ExcludedMethods { get; set; } =
    [
        CategorizationMethod.CanonicalPayeeLookup,
        CategorizationMethod.PayeeModel,
        CategorizationMethod.PayeeClusterLookup,
        CategorizationMethod.PayeeIdLookup,
        CategorizationMethod.ImportLookup
    ];

    public CategorizationMethod[] StrongSignalMethods { get; set; } =
    [
        CategorizationMethod.ImportAmountLookup,
        CategorizationMethod.HierarchicalModel
    ];

    public bool IsEligible(CategorizationMethod method) =>
        EligibleMethods.Length > 0
            ? EligibleMethods.Contains(method)
            : !ExcludedMethods.Contains(method);
}
