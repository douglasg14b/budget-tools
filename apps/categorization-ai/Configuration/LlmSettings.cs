namespace YnabCategoryAi.Configuration;

public class LlmSettings
{
    public bool Enabled { get; set; }

    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = "gpt-4.1-nano";

    public string BaseUrl { get; set; } = "https://api.openai.com/v1";

    /// <summary>Cap holdout LLM eval calls (0 = no cap).</summary>
    public int MaxEvalSamples { get; set; } = 0;

    public bool HasApiKey => !string.IsNullOrWhiteSpace(ApiKey);

    public bool IsConfigured => Enabled && HasApiKey;
}
