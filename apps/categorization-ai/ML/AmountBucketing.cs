namespace YnabCategoryAi.ML;

public static class AmountBucketing
{
    /// <summary>Bucket YNAB milliunit amounts for disambiguating multi-category payees.</summary>
    public static string Bucket(int amountMilliunits)
    {
        decimal dollars = Math.Abs(amountMilliunits) / 1000m;
        return dollars switch
        {
            < 10m => "xs",
            < 30m => "sm",
            < 100m => "md",
            < 300m => "lg",
            _ => "xl"
        };
    }
}
