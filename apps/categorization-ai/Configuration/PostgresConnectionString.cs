using Npgsql;

namespace YnabCategoryAi.Configuration;

/// <summary>
/// Normalizes the monorepo <c>DB_CONNECTION_STRING</c> (Node/pg URI) into Npgsql keyword format.
/// </summary>
public static class PostgresConnectionString
{
    public static string Resolve(string? environmentValue, string? configuredValue)
    {
        string? candidate = NullIfEmpty(Sanitize(environmentValue)) ?? NullIfEmpty(Sanitize(configuredValue));
        if (candidate is null)
        {
            throw new InvalidOperationException(
                "Database connection string not found. " +
                "Set DB_CONNECTION_STRING or ConnectionStrings:BudgetTools in appsettings.json.");
        }

        return IsPostgresUri(candidate) ? FromPostgresUri(candidate) : candidate;
    }

    internal static string FromPostgresUri(string uriString)
    {
        if (!Uri.TryCreate(uriString, UriKind.Absolute, out Uri? uri))
        {
            throw new InvalidOperationException(
                "DB_CONNECTION_STRING is not a valid postgres URI. " +
                "Use postgresql://user:password@host:port/database or Npgsql keyword format (Host=...;).");
        }

        string database = uri.AbsolutePath.Trim('/');
        if (string.IsNullOrWhiteSpace(database))
        {
            throw new InvalidOperationException("DB_CONNECTION_STRING URI is missing a database name path.");
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(database),
        };

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            string[] parts = uri.UserInfo.Split(':', 2);
            builder.Username = Uri.UnescapeDataString(parts[0]);
            if (parts.Length > 1)
            {
                builder.Password = Uri.UnescapeDataString(parts[1]);
            }
        }

        return builder.ConnectionString;
    }

    private static bool IsPostgresUri(string value) =>
        value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        || value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);

    private static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string trimmed = value.Trim().Trim('\uFEFF');
        if (trimmed.Length >= 2 && trimmed[0] == trimmed[^1] && (trimmed[0] is '"' or '\''))
        {
            trimmed = trimmed[1..^1].Trim();
        }

        return trimmed.Length > 0 ? trimmed : null;
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
