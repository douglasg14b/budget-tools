using System.Text.Json.Serialization;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

/// <summary>How confidently the pipeline recommends acting on a prediction.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ApprovalTier
{
    /// <summary>Strict consensus passed — safe to auto-apply (~96% precision).</summary>
    AutoApply,

    /// <summary>Good suggestion — one-tap approve in UI (2 ML agree, LLM, etc.).</summary>
    Suggested,

    /// <summary>Weak or conflicting signals — user should pick from alternatives.</summary>
    Review,

    /// <summary>Excluded payee/check — never auto-categorize.</summary>
    Blocked
}

/// <summary>Why a transaction did not reach auto-apply tier.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ProposalGapReason
{
    None,
    AmbiguousMerchant,
    InsufficientAgreement,
    TwoMethodSuggestion,
    SingleMethodSuggestion,
    ImportAmountNearMiss,
    NoQualifiedSignals,
    LlmSuggestion,
    Excluded,
    PeriodicConflict
}

public sealed class CategorizationFlags
{
    public bool IsAmbiguous { get; init; }
    public bool IsNovelImport { get; init; }
    public bool IsExcluded { get; init; }
    public bool RequiresManualReview { get; init; }
    public bool IsPeriodic { get; init; }
    public bool IsPeriodicConflict { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool IsTravelWindow { get; init; }
}

public sealed record TravelWindowHitDto(
    Guid Id,
    string Name,
    string Kind,
    string? TargetCategory);

public sealed record MethodSignalDto(
    CategorizationMethod Method,
    string Category,
    float Confidence);

public sealed record PayeeSuggestionDto(
    string Name,
    PayeeResolutionMethod Method,
    float Confidence,
    bool NeedsRename);

public sealed record CategorySuggestionDto(
    string Category,
    string? CategoryGroup,
    string? CategoryId,
    float Confidence,
    CategorizationMethod PrimaryMethod,
    int AgreeingMethodCount,
    IReadOnlyList<CategorizationMethod> AgreeingMethods);

/// <summary>
/// Rich categorization output for APIs and approval UIs.
/// <see cref="CategorizationResult"/> is the legacy/summary projection via <see cref="ToResult"/>.
/// </summary>
public sealed class CategorizationProposal
{
    public required string TransactionId { get; init; }
    public required ApprovalTier Tier { get; init; }
    public required CategorizationFlags Flags { get; init; }

    public string? SuggestedCategory { get; init; }
    public string? SuggestedCategoryGroup { get; init; }
    public string? SuggestedCategoryId { get; init; }
    public float Confidence { get; init; }
    public CategorizationMethod Method { get; init; }
    public CategorizationRouteReason RouteReason { get; init; }
    public ProposalGapReason GapReason { get; init; }

    public IReadOnlyList<MethodSignalDto> Signals { get; init; } = [];
    public IReadOnlyList<MethodSignalDto> AgreeingSignals { get; init; } = [];

    /// <summary>Ranked category choices for the approval UI (1 = top pick).</summary>
    public IReadOnlyList<CategoryOptionDto> Options { get; init; } = [];

    /// <summary>Confidence scores for the top one to three options.</summary>
    public ConfidenceIntervalDto ConfidenceInterval { get; init; } = new(0, null, null, 0);

    /// <summary>Deprecated alias — use <see cref="Options"/>.</summary>
    [JsonIgnore]
    public IReadOnlyList<CategorySuggestionDto> Alternatives =>
        Options.Select(o => new CategorySuggestionDto(
            o.Category,
            o.CategoryGroup,
            o.CategoryId,
            o.Confidence,
            o.SupportingMethods.FirstOrDefault().Method,
            o.SupportingMethods.Select(m => m.Method).Distinct().Count(),
            o.SupportingMethods.Select(m => m.Method).Distinct().ToList())).ToList();

    public string FeatureText { get; init; } = string.Empty;
    public string? ResolvedPayee { get; init; }

    /// <summary>
    /// Canonical payee predicted from the bank import string. Null when unresolved or below threshold.
    /// <see cref="PayeeSuggestionDto.NeedsRename"/> is true only when the current YNAB payee still
    /// looks like the import text.
    /// </summary>
    public PayeeSuggestionDto? PayeeSuggestion { get; init; }

    public string? Notes { get; init; }
    public PeriodicMatch? PeriodicMatch { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TravelWindowHitDto? TravelWindow { get; init; }

    public CategorizationResult ToResult()
    {
        bool isReliable = Tier == ApprovalTier.AutoApply
            && SuggestedCategory != null
            && Confidence >= 0.85f
            && !Flags.RequiresManualReview;

        CategorizationMethod method = Tier switch
        {
            ApprovalTier.AutoApply => CategorizationMethod.Consensus,
            ApprovalTier.Blocked => CategorizationMethod.Excluded,
            _ when Method != CategorizationMethod.None => Method,
            _ => CategorizationMethod.ManualReview
        };

        return new CategorizationResult
        {
            TransactionId = TransactionId,
            PredictedCategory = Tier is ApprovalTier.AutoApply or ApprovalTier.Suggested
                ? SuggestedCategory
                : null,
            PredictedCategoryGroup = SuggestedCategoryGroup,
            ResolvedPayee = ResolvedPayee,
            Confidence = Confidence,
            Method = method,
            RouteReason = RouteReason,
            IsReliable = isReliable,
            RequiresManualReview = Tier != ApprovalTier.AutoApply,
            FeatureText = FeatureText,
            Notes = Notes
        };
    }
}
