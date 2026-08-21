using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public sealed class HierarchicalClassificationModel
{
    private readonly GroupClassificationModel _groupModel;
    private readonly CategoryClassificationModel _categoryModel;
    private readonly CategoryCatalog _catalog;

    public HierarchicalClassificationModel(
        GroupClassificationModel groupModel,
        CategoryClassificationModel categoryModel,
        CategoryCatalog catalog)
    {
        _groupModel = groupModel;
        _categoryModel = categoryModel;
        _catalog = catalog;
    }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, bool forceRetrain = false)
    {
        _groupModel.Train(transactions, forceRetrain);
        _categoryModel.Train(transactions, forceRetrain);
        _groupModel.Load();
        _categoryModel.Load();
    }

    public void Load()
    {
        _groupModel.Load();
        _categoryModel.Load();
    }

    public bool TryPredict(
        string featureText,
        float amountMilliunits,
        string accountName,
        float confidenceThreshold,
        out string category,
        out string? categoryGroup,
        out float confidence)
    {
        category = string.Empty;
        categoryGroup = null;
        confidence = 0;

        if (!_groupModel.TryPredict(
                featureText,
                amountMilliunits,
                accountName,
                confidenceThreshold,
                out string predictedGroup,
                out float groupConfidence))
        {
            return false;
        }

        if (!_categoryModel.TryPredict(
                featureText,
                amountMilliunits,
                accountName,
                confidenceThreshold,
                out string predictedCategory,
                out float categoryConfidence))
        {
            return false;
        }

        if (!_catalog.CategoryBelongsToGroup(predictedCategory, predictedGroup))
            return false;

        if (!_catalog.IsLocallyTrainable(predictedCategory))
            return false;

        categoryGroup = predictedGroup;
        category = predictedCategory;
        confidence = Math.Min(groupConfidence, categoryConfidence);
        return confidence >= confidenceThreshold;
    }
}
