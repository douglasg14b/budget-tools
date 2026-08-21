using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Trainers.LightGbm;
using Microsoft.ML.Transforms.Text;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Models;

namespace YnabCategoryAi.ML;

public sealed class GroupClassificationModel
{
    private readonly MLContext _mlContext;
    private readonly string _modelPath;
    private PredictionEngine<GroupClassificationInput, GroupClassificationPrediction>? _engine;

    public GroupClassificationModel(MLContext mlContext, MlSettings settings)
    {
        _mlContext = mlContext;
        _modelPath = settings.GroupModelPath;
    }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, bool forceRetrain = false)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_modelPath)!);

        if (!forceRetrain && File.Exists(_modelPath))
            return;

        List<GroupClassificationInput> examples = TrainingDataBuilder.BuildGroupExamples(transactions)
            .Select(x => new GroupClassificationInput
            {
                FeatureText = x.FeatureText,
                CategoryGroupName = x.CategoryGroupName,
                Amount = x.Amount,
                AccountName = x.AccountName
            })
            .ToList();

        if (examples.Count < 100)
            return;

        IDataView data = _mlContext.Data.LoadFromEnumerable(examples);
        ITransformer model = BuildPipeline().Fit(data);
        _mlContext.Model.Save(model, data.Schema, _modelPath);
        _engine = null;
    }

    public void Load()
    {
        if (!File.Exists(_modelPath))
            return;

        ITransformer model = _mlContext.Model.Load(_modelPath, out _);
        _engine = _mlContext.Model.CreatePredictionEngine<GroupClassificationInput, GroupClassificationPrediction>(model);
    }

    public bool TryPredict(
        string featureText,
        float amountMilliunits,
        string accountName,
        float confidenceThreshold,
        out string group,
        out float confidence)
    {
        group = string.Empty;
        confidence = 0;

        if (_engine == null && File.Exists(_modelPath))
            Load();

        if (_engine == null)
            return false;

        string? processedText = TextPreprocessor.Preprocess(featureText);
        if (processedText == null)
            return false;

        GroupClassificationPrediction prediction = _engine.Predict(new GroupClassificationInput
        {
            FeatureText = processedText,
            Amount = Math.Abs(amountMilliunits) / 1000f,
            AccountName = TextPreprocessor.Preprocess(accountName) ?? accountName
        });

        confidence = prediction.Score.Length == 0 ? 0 : prediction.Score.Max();

        if (confidence < confidenceThreshold || string.IsNullOrWhiteSpace(prediction.PredictedLabel))
            return false;

        group = prediction.PredictedLabel;
        return true;
    }

    private IEstimator<ITransformer> BuildPipeline() =>
        _mlContext.Transforms.Conversion
            .MapValueToKey(nameof(GroupClassificationInput.CategoryGroupName))
            .Append(_mlContext.Transforms.Text.FeaturizeText(
                "TextFeatures",
                new TextFeaturizingEstimator.Options
                {
                    WordFeatureExtractor = new WordBagEstimator.Options { NgramLength = 2, UseAllLengths = true },
                    CharFeatureExtractor = new WordBagEstimator.Options { NgramLength = 3, UseAllLengths = true },
                    Norm = TextFeaturizingEstimator.NormFunction.L2
                },
                nameof(GroupClassificationInput.FeatureText)))
            .Append(_mlContext.Transforms.Categorical.OneHotEncoding(
                "AccountFeatures",
                nameof(GroupClassificationInput.AccountName)))
            .Append(_mlContext.Transforms.Concatenate(
                "Features",
                "TextFeatures",
                "AccountFeatures",
                nameof(GroupClassificationInput.Amount)))
            .AppendCacheCheckpoint(_mlContext)
            .Append(_mlContext.MulticlassClassification.Trainers.LightGbm(new LightGbmMulticlassTrainer.Options
            {
                LabelColumnName = nameof(GroupClassificationInput.CategoryGroupName),
                FeatureColumnName = "Features",
                NumberOfLeaves = 32,
                MinimumExampleCountPerLeaf = 10,
                LearningRate = 0.1
            }))
            .Append(_mlContext.Transforms.Conversion.MapKeyToValue(
                nameof(GroupClassificationPrediction.PredictedLabel),
                nameof(GroupClassificationPrediction.PredictedLabel)));
}
