using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Llm;

public sealed class LlmCategorizationRequest
{
    public required string FeatureText { get; init; }
    public required decimal AmountDollars { get; init; }
    public required string AccountName { get; init; }
    public string? Memo { get; init; }
    public required IReadOnlyList<CategoryInfo> CandidateCategories { get; init; }
    public string? SuggestedGroupName { get; init; }
    public required LlmRoutingReason RoutingReason { get; init; }
}

public enum LlmRoutingReason
{
    AmbiguousMerchant,
    NoLocalPrediction,
    UntrainedCategory,
    NovelImportString
}

public sealed class LlmCategorizationResponse
{
    public string? CategoryName { get; init; }
    public string? CategoryGroupName { get; init; }
    public float Confidence { get; init; }
    public string? Rationale { get; init; }
}

public interface ILlmCategorizationService
{
    bool IsAvailable { get; }

    Task<LlmCategorizationResponse?> CategorizeAsync(
        LlmCategorizationRequest request,
        CancellationToken cancellationToken = default);
}
