using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public sealed record CategoryOptionDto(
    int Rank,
    string Category,
    string? CategoryGroup,
    string? CategoryId,
    float Confidence,
    IReadOnlyList<MethodSignalDto> SupportingMethods);

/// <summary>Confidence scores for the top ranked category options.</summary>
public sealed record ConfidenceIntervalDto(
    float Top,
    float? Second,
    float? Third,
    float Spread);

public static class CategoryOptionRanker
{
    public static IReadOnlyList<CategoryOptionDto> Rank(
        IReadOnlyList<MethodSignal> signals,
        CategoryCatalog catalog,
        float minConfidence,
        int maxOptions)
    {
        if (signals.Count == 0 || maxOptions <= 0)
            return [];

        return signals
            .Where(s => s.Confidence >= minConfidence)
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                List<MethodSignal> ordered = group.OrderByDescending(s => s.Confidence).ToList();
                MethodSignal peak = ordered[0];
                float confidence = ComputeOptionConfidence(ordered);

                ResolveCategory(catalog, peak.Category, out string? groupName, out string? id);

                return new CategoryOptionDto(
                    Rank: 0,
                    Category: peak.Category,
                    CategoryGroup: groupName,
                    CategoryId: id,
                    Confidence: confidence,
                    SupportingMethods: ordered
                        .Select(s => new MethodSignalDto(s.Method, s.Category, s.Confidence))
                        .ToList());
            })
            .OrderByDescending(o => o.Confidence)
            .ThenByDescending(o => o.SupportingMethods.Count)
            .Take(maxOptions)
            .Select((option, index) => option with { Rank = index + 1 })
            .ToList();
    }

    public static ConfidenceIntervalDto BuildInterval(IReadOnlyList<CategoryOptionDto> options)
    {
        if (options.Count == 0)
            return new ConfidenceIntervalDto(0, null, null, 0);

        float top = options[0].Confidence;
        float? second = options.Count > 1 ? options[1].Confidence : null;
        float? third = options.Count > 2 ? options[2].Confidence : null;
        float spread = second == null ? 0 : top - (third ?? second.Value);

        return new ConfidenceIntervalDto(top, second, third, spread);
    }

    /// <summary>
    /// Peak signal confidence, with a small boost when multiple methods agree on the category.
    /// </summary>
    private static float ComputeOptionConfidence(IReadOnlyList<MethodSignal> signalsForCategory)
    {
        float peak = signalsForCategory.Max(s => s.Confidence);
        int distinctMethods = signalsForCategory.Select(s => s.Method).Distinct().Count();
        float agreementBoost = Math.Min(0.05f, (distinctMethods - 1) * 0.02f);
        return Math.Min(1f, peak + agreementBoost);
    }

    private static void ResolveCategory(CategoryCatalog catalog, string category, out string? group, out string? id)
    {
        if (catalog.TryResolveCategory(category, out CategoryInfo info))
        {
            group = info.GroupName;
            id = info.Id;
            return;
        }

        group = null;
        id = null;
    }
}
