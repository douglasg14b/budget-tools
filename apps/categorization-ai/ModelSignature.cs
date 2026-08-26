using YnabCategoryAi.Configuration;

namespace YnabCategoryAi;

/// <summary>
/// Matches the API's <c>modelSignature()</c> fingerprint for proposal cache invalidation.
/// </summary>
public static class ModelSignature
{
  private static readonly string[] ModelFiles =
  [
    "category-model.zip",
    "group-model.zip",
    "payee-model.zip",
  ];

  public static string Compute(MlSettings settings)
  {
    return string.Join(
      "|",
      ModelFiles.Select(fileName =>
      {
        string path = ResolveModelPath(settings, fileName);
        FileInfo info = new(path);
        return $"{fileName}:{info.Length}:{new DateTimeOffset(info.LastWriteTimeUtc).ToUnixTimeMilliseconds()}";
      }));
  }

  private static string ResolveModelPath(MlSettings settings, string fileName)
  {
    return fileName switch
    {
      "category-model.zip" => settings.CategoryModelPath,
      "group-model.zip" => settings.GroupModelPath,
      "payee-model.zip" => settings.PayeeModelPath,
      _ => throw new ArgumentOutOfRangeException(nameof(fileName), fileName, null),
    };
  }
}
