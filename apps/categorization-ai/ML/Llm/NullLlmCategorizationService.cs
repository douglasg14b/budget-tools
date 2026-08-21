namespace YnabCategoryAi.ML.Llm;

public sealed class NullLlmCategorizationService : ILlmCategorizationService
{
    public bool IsAvailable => false;

    public Task<LlmCategorizationResponse?> CategorizeAsync(
        LlmCategorizationRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<LlmCategorizationResponse?>(null);
}
