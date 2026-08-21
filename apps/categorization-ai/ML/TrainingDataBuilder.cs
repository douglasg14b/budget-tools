using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public static class TrainingDataBuilder
{
    public static IEnumerable<PayeeMappingExample> BuildPayeeMappingExamples(IEnumerable<TrainingTransaction> transactions)
    {
        foreach (TrainingTransaction t in transactions)
        {
            if (string.IsNullOrWhiteSpace(t.PayeeName))
                continue;

            foreach (string? raw in new[] { t.ImportPayeeNameOriginal, t.ImportPayeeName })
            {
                string? importText = TextPreprocessor.Preprocess(raw);
                string? canonicalNormalized = TextPreprocessor.Preprocess(t.PayeeName);
                if (importText == null
                    || canonicalNormalized == null
                    || string.Equals(importText, canonicalNormalized, StringComparison.Ordinal))
                    continue;

                yield return new PayeeMappingExample(importText, t.PayeeName);
            }
        }
    }

    public static IEnumerable<CategoryTrainingExample> BuildCategoryExamples(IEnumerable<TrainingTransaction> transactions)
    {
        foreach (TrainingTransaction t in transactions)
        {
            if (string.IsNullOrWhiteSpace(t.CategoryGroupName))
                continue;

            string? text = BuildPrimaryFeatureText(t);
            if (text == null)
                continue;

            float amount = Math.Abs(t.Amount) / 1000f;
            string account = TextPreprocessor.Preprocess(t.AccountName) ?? t.AccountName;
            yield return new CategoryTrainingExample(text, t.CategoryName, amount, account);
        }
    }

    public static IEnumerable<GroupTrainingExample> BuildGroupExamples(IEnumerable<TrainingTransaction> transactions)
    {
        foreach (TrainingTransaction t in transactions)
        {
            if (string.IsNullOrWhiteSpace(t.CategoryGroupName))
                continue;

            string? text = BuildPrimaryFeatureText(t);
            if (text == null)
                continue;

            float amount = Math.Abs(t.Amount) / 1000f;
            string account = TextPreprocessor.Preprocess(t.AccountName) ?? t.AccountName;
            yield return new GroupTrainingExample(text, t.CategoryGroupName, amount, account);
        }
    }

    /// <summary>Matches inference when no memo is present (primary import/payee text only).</summary>
    public static string? BuildPrimaryFeatureText(TrainingTransaction t) =>
        TextPreprocessor.Preprocess(
            TextPreprocessor.PrimaryImportText(
                t.ImportPayeeNameOriginal,
                t.ImportPayeeName,
                t.PayeeName));
}

public readonly record struct PayeeMappingExample(string ImportText, string CanonicalPayee);

public readonly record struct CategoryTrainingExample(
    string FeatureText,
    string CategoryName,
    float Amount,
    string AccountName);

public readonly record struct GroupTrainingExample(
    string FeatureText,
    string CategoryGroupName,
    float Amount,
    string AccountName);
