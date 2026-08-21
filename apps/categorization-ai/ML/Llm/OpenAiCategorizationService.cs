using System.ClientModel;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using OpenAI.Chat;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Llm;

public sealed class OpenAiCategorizationService : ILlmCategorizationService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly LlmSettings _settings;
    private readonly ChatClient _chatClient;

    public OpenAiCategorizationService(LlmSettings settings)
    {
        _settings = settings;

        Uri endpoint = ResolveEndpoint(settings.BaseUrl);
        _chatClient = new ChatClient(
            model: settings.Model,
            credential: new ApiKeyCredential(settings.ApiKey),
            options: new OpenAI.OpenAIClientOptions { Endpoint = endpoint });
    }

    public bool IsAvailable => _settings.HasApiKey;

    public async Task<LlmCategorizationResponse?> CategorizeAsync(
        LlmCategorizationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsAvailable)
            return null;

        string systemPrompt = BuildSystemPrompt(request);
        string userPrompt = BuildUserPrompt(request);

        ChatCompletionOptions options = new()
        {
            Temperature = 0.1f,
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                jsonSchemaFormatName: "category_prediction",
                jsonSchema: BinaryData.FromBytes("""
                    {
                        "type": "object",
                        "properties": {
                            "categoryName": { "type": "string" },
                            "categoryGroupName": { "type": "string" },
                            "confidence": { "type": "number" },
                            "rationale": { "type": "string" }
                        },
                        "required": ["categoryName", "confidence"],
                        "additionalProperties": false
                    }
                    """u8.ToArray()),
                jsonSchemaIsStrict: true)
        };

        List<ChatMessage> messages =
        [
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(userPrompt)
        ];

        try
        {
            ChatCompletion completion = await _chatClient.CompleteChatAsync(messages, options, cancellationToken);
            string? content = completion.Content.Count > 0 ? completion.Content[0].Text : null;

            if (string.IsNullOrWhiteSpace(content))
                return null;

            LlmJsonResponse? parsed = JsonSerializer.Deserialize<LlmJsonResponse>(content, JsonOptions);
            if (parsed == null || string.IsNullOrWhiteSpace(parsed.CategoryName))
                return null;

            return new LlmCategorizationResponse
            {
                CategoryName = CategoryNormalizer.Normalize(parsed.CategoryName),
                CategoryGroupName = CategoryNormalizer.Normalize(parsed.CategoryGroupName),
                Confidence = Math.Clamp(parsed.Confidence, 0f, 1f),
                Rationale = parsed.Rationale
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"LLM request failed: {ex.Message}");
            return null;
        }
    }

    private static Uri ResolveEndpoint(string baseUrl)
    {
        string trimmed = baseUrl.TrimEnd('/');
        if (trimmed.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
            trimmed = trimmed[..^3];

        return new Uri(trimmed);
    }

    private static string BuildSystemPrompt(LlmCategorizationRequest request)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You categorize personal budget transactions into YNAB categories.");
        sb.AppendLine("Pick exactly one category from the candidate list.");
        sb.AppendLine("If genuinely uncertain, set confidence below 0.5.");
        sb.AppendLine();
        sb.AppendLine("Candidate categories (name | group):");

        foreach (CategoryInfo c in request.CandidateCategories.OrderBy(c => c.GroupName).ThenBy(c => c.Name))
            sb.AppendLine($"- {c.Name} | {c.GroupName}");

        return sb.ToString();
    }

    private static string BuildUserPrompt(LlmCategorizationRequest request)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Routing reason: {request.RoutingReason}");
        sb.AppendLine($"Payee / import text: {request.FeatureText}");
        sb.AppendLine($"Amount (USD): {request.AmountDollars:F2}");
        sb.AppendLine($"Account: {request.AccountName}");

        if (!string.IsNullOrWhiteSpace(request.Memo))
            sb.AppendLine($"Memo: {request.Memo}");

        if (!string.IsNullOrWhiteSpace(request.SuggestedGroupName))
            sb.AppendLine($"Suggested category group: {request.SuggestedGroupName}");

        return sb.ToString();
    }

    private sealed class LlmJsonResponse
    {
        public string? CategoryName { get; set; }
        public string? CategoryGroupName { get; set; }
        public float Confidence { get; set; }
        public string? Rationale { get; set; }
    }
}
