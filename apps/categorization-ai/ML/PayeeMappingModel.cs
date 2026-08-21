using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Transforms.Text;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Models;

namespace YnabCategoryAi.ML;

public sealed class PayeeMappingModel
{
    private readonly MLContext _mlContext;
    private readonly string _modelPath;
    private readonly PayeeResolutionSettings _payeeResolution;
    private PredictionEngine<PayeeMappingInput, PayeeMappingPrediction>? _engine;

    public PayeeMappingModel(MLContext mlContext, MlSettings settings)
    {
        _mlContext = mlContext;
        _modelPath = settings.PayeeModelPath;
        _payeeResolution = settings.PayeeResolution;
    }

    public void Train(IReadOnlyList<TrainingTransaction> transactions, bool forceRetrain = false)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_modelPath)!);

        if (!forceRetrain && File.Exists(_modelPath))
            return;

        List<PayeeMappingInput> examples = PayeeTrainingDataBuilder
            .BuildOversampledExamples(transactions, _payeeResolution)
            .Select(x => new PayeeMappingInput { ImportText = x.ImportText, CanonicalPayee = x.CanonicalPayee })
            .ToList();

        if (examples.Count < 50)
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
        _engine = _mlContext.Model.CreatePredictionEngine<PayeeMappingInput, PayeeMappingPrediction>(model);
    }

    public bool TryPredict(string importText, float confidenceThreshold, out string payee, out float confidence)
    {
        payee = string.Empty;
        confidence = 0;

        if (_engine == null && File.Exists(_modelPath))
            Load();

        if (_engine == null)
            return false;

        string? processed = TextPreprocessor.Preprocess(importText);
        if (processed == null)
            return false;

        PayeeMappingPrediction prediction = _engine.Predict(new PayeeMappingInput { ImportText = processed });
        confidence = prediction.Score.Length == 0 ? 0 : prediction.Score.Max();

        if (confidence < confidenceThreshold || string.IsNullOrWhiteSpace(prediction.PredictedLabel))
            return false;

        payee = prediction.PredictedLabel;
        return true;
    }

    public MulticlassClassificationMetrics? CrossValidate(IReadOnlyList<TrainingTransaction> transactions, int folds = 5)
    {
        List<PayeeMappingInput> examples = PayeeTrainingDataBuilder
            .BuildOversampledExamples(transactions, _payeeResolution)
            .Select(x => new PayeeMappingInput { ImportText = x.ImportText, CanonicalPayee = x.CanonicalPayee })
            .ToList();

        if (examples.Count < folds * 2)
            return null;

        IDataView data = _mlContext.Data.LoadFromEnumerable(examples);
        var results = _mlContext.MulticlassClassification.CrossValidate(
            data,
            BuildPipeline(),
            numberOfFolds: folds,
            labelColumnName: nameof(PayeeMappingInput.CanonicalPayee));

        return _mlContext.MulticlassClassification.Evaluate(
            results.OrderByDescending(r => r.Metrics.MacroAccuracy).First().Model.Transform(data),
            labelColumnName: nameof(PayeeMappingInput.CanonicalPayee));
    }

    private IEstimator<ITransformer> BuildPipeline() =>
        _mlContext.Transforms.Conversion
            .MapValueToKey(nameof(PayeeMappingInput.CanonicalPayee))
            .Append(_mlContext.Transforms.Text.FeaturizeText(
                "Features",
                new TextFeaturizingEstimator.Options
                {
                    WordFeatureExtractor = new WordBagEstimator.Options { NgramLength = 2, UseAllLengths = true },
                    CharFeatureExtractor = new WordBagEstimator.Options { NgramLength = 3, UseAllLengths = true },
                    Norm = TextFeaturizingEstimator.NormFunction.L2
                },
                nameof(PayeeMappingInput.ImportText)))
            .AppendCacheCheckpoint(_mlContext)
            .Append(_mlContext.MulticlassClassification.Trainers.LightGbm(
                labelColumnName: nameof(PayeeMappingInput.CanonicalPayee),
                featureColumnName: "Features"))
            .Append(_mlContext.Transforms.Conversion.MapKeyToValue(
                nameof(PayeeMappingPrediction.PredictedLabel),
                nameof(PayeeMappingPrediction.PredictedLabel)));
}
