namespace YnabCategoryAi.Configuration;

public class ClassificationExclusionSettings
{
    /// <summary>Payees we never auto-classify (Amazon, Walmart, etc.).</summary>
    public List<string> PayeePatterns { get; set; } =
    [
        "amazon", "amzn", "walmart", "wal mart", "safeway", "costco",
        "target", "sams club", "sam's club", "kroger", "whole foods",
        "wholefds", "aldi", "trader joe", "meijer", "heb", "publix"
    ];

    /// <summary>Check-related patterns matched against payee, import text, and memo.</summary>
    public List<string> CheckPatterns { get; set; } =
    [
        "check", "chk", "check deposit", "mobile check", "counter check", "check pmt"
    ];
}
