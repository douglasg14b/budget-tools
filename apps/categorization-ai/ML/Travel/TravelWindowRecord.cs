namespace YnabCategoryAi.ML.Travel;

public sealed record TravelWindowRecord(
    Guid Id,
    string Name,
    string Kind,
    DateOnly StartDate,
    DateOnly EndDate,
    string? AccountId);
