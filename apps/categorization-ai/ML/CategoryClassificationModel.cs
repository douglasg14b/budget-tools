using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Trainers.LightGbm;
using Microsoft.ML.Transforms.Text;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Models;

namespace YnabCategoryAi.ML;

public sealed class CategoryClassificationModel
{
    private readonly MLContext _mlContext;
    private readonly string _modelPath;
    private PredictionEngine<CategoryClassificationInput, CategoryClassificationPrediction>? _engine;

    public CategoryClassificationModel(MLContext mlContext, MlSettings settings)
    {
        _mlContext = mlContext;
        _modelPath = settings.CategoryModelPath;
    }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, bool forceRetrain = false)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_modelPath)!);

        if (!forceRetrain && File.Exists(_modelPath))
            return;

        List<CategoryClassificationInput> examples = TrainingDataBuilder.BuildCategoryExamples(transactions)
            .Select(x => new CategoryClassificationInput
            {
                FeatureText = x.FeatureText,
                CategoryName = x.CategoryName,
                Amount = x.Amount,
                AccountName = x.AccountName
            })
            .ToList();

        if (examples.Count < 100)
            throw new InvalidOperationException($"Not enough category training examples ({examples.Count}). Need at least 100.");

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
        _engine = _mlContext.Model.CreatePredictionEngine<CategoryClassificationInput, CategoryClassificationPrediction>(model);
    }

    public bool TryPredict(
        string featureText,
        float amountMilliunits,
        string accountName,
        float confidenceThreshold,
        out string category,
        out float confidence)
    {
        category = string.Empty;
        confidence = 0;

        if (_engine == null && File.Exists(_modelPath))
            Load();

        if (_engine == null)
            return false;

        string? processedText = TextPreprocessor.Preprocess(featureText);
        if (processedText == null)
            return false;

        CategoryClassificationPrediction prediction = _engine.Predict(new CategoryClassificationInput
        {
            FeatureText = processedText,
            Amount = Math.Abs(amountMilliunits) / 1000f,
            AccountName = TextPreprocessor.Preprocess(accountName) ?? accountName
        });

        confidence = prediction.Score.Length == 0 ? 0 : prediction.Score.Max();

        if (confidence < confidenceThreshold || string.IsNullOrWhiteSpace(prediction.PredictedLabel))
            return false;

        category = prediction.PredictedLabel;
        return true;
    }

    public (MulticlassClassificationMetrics Metrics, int TrainCount, int TestCount)? EvaluateHoldout(
        IReadOnlyList<TrainingTransaction> transactions,
        float holdoutFraction)
    {
        List<CategoryClassificationInput> examples = TrainingDataBuilder.BuildCategoryExamples(transactions)
            .Select(x => new CategoryClassificationInput
            {
                FeatureText = x.FeatureText,
                CategoryName = x.CategoryName,
                Amount = x.Amount,
                AccountName = x.AccountName
            })
            .ToList();

        if (examples.Count < 20)
            return null;

        IDataView data = _mlContext.Data.LoadFromEnumerable(examples);
        var split = _mlContext.Data.TrainTestSplit(data, testFraction: holdoutFraction);

        ITransformer model = BuildPipeline().Fit(split.TrainSet);
        IDataView predictions = model.Transform(split.TestSet);

        MulticlassClassificationMetrics metrics = _mlContext.MulticlassClassification.Evaluate(
            predictions,
            labelColumnName: nameof(CategoryClassificationInput.CategoryName));

        return (metrics, (int)(split.TrainSet.GetRowCount() ?? 0), (int)(split.TestSet.GetRowCount() ?? 0));
    }

    private IEstimator<ITransformer> BuildPipeline() =>
        _mlContext.Transforms.Conversion
            .MapValueToKey(nameof(CategoryClassificationInput.CategoryName))
            .Append(_mlContext.Transforms.Text.FeaturizeText(
                "TextFeatures",
                new TextFeaturizingEstimator.Options
                {
                    WordFeatureExtractor = new WordBagEstimator.Options { NgramLength = 2, UseAllLengths = true },
                    CharFeatureExtractor = new WordBagEstimator.Options { NgramLength = 3, UseAllLengths = true },
                    Norm = TextFeaturizingEstimator.NormFunction.L2
                },
                nameof(CategoryClassificationInput.FeatureText)))
            .Append(_mlContext.Transforms.Categorical.OneHotEncoding(
                "AccountFeatures",
                nameof(CategoryClassificationInput.AccountName)))
            .Append(_mlContext.Transforms.Concatenate(
                "Features",
                "TextFeatures",
                "AccountFeatures",
                nameof(CategoryClassificationInput.Amount)))
            .AppendCacheCheckpoint(_mlContext)
            .Append(_mlContext.MulticlassClassification.Trainers.LightGbm(new LightGbmMulticlassTrainer.Options
            {
                LabelColumnName = nameof(CategoryClassificationInput.CategoryName),
                FeatureColumnName = "Features",
                NumberOfLeaves = 64,
                MinimumExampleCountPerLeaf = 10,
                LearningRate = 0.1
            }))
            .Append(_mlContext.Transforms.Conversion.MapKeyToValue(
                nameof(CategoryClassificationPrediction.PredictedLabel),
                nameof(CategoryClassificationPrediction.PredictedLabel)));
}
