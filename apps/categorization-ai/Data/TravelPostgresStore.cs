using Npgsql;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.ML.Travel;

namespace YnabCategoryAi.Data;

/// <summary>
/// Loads travel-bias configuration and travel windows from the shared Budget Tools Postgres.
/// Previously read the API's SQLite file (<c>SQLITE_DB_PATH</c>); the API now keeps these tables
/// in Postgres, so the scorer reads them from <c>DB_CONNECTION_STRING</c> like its other data.
/// </summary>
public static class TravelPostgresStore
{
    /// <param name="dbConnectionString">
    /// The monorepo <c>DB_CONNECTION_STRING</c> (a pg URI) or an Npgsql keyword string. When null
    /// or empty, travel bias defaults to enabled with no windows (matching the prior SQLite
    /// behaviour when the path was unset).
    /// </param>
    public static (bool Enabled, IReadOnlyList<TravelWindowRecord> Windows) Load(string? dbConnectionString)
    {
        if (string.IsNullOrWhiteSpace(dbConnectionString))
        {
            return (true, []);
        }

        string connectionString = PostgresConnectionString.Resolve(dbConnectionString, null);
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        bool enabled = ReadEnabled(connection);
        if (!enabled)
        {
            return (false, []);
        }

        return (true, ReadWindows(connection));
    }

    private static bool ReadEnabled(NpgsqlConnection connection)
    {
        using NpgsqlCommand command = connection.CreateCommand();
        command.CommandText = "SELECT enabled FROM travel_bias_config WHERE id = 1";
        object? value = command.ExecuteScalar()
            ?? throw new InvalidOperationException(
                "travel_bias_config is missing from Postgres. Run the @budget-tools/db migrator first.");
        return Convert.ToBoolean(value);
    }

    private static IReadOnlyList<TravelWindowRecord> ReadWindows(NpgsqlConnection connection)
    {
        using NpgsqlCommand command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT w.id, w.name, w.kind, w.start_date, w.end_date, w.location, a.account_id
            FROM travel_windows w
            LEFT JOIN travel_window_accounts a ON a.window_id = w.id
            """;

        var grouped = new Dictionary<Guid, WindowAccumulator>();
        using NpgsqlDataReader reader = command.ExecuteReader();
        while (reader.Read())
        {
            Guid id = Guid.Parse(reader.GetString(0));
            if (!grouped.TryGetValue(id, out WindowAccumulator? accumulator))
            {
                accumulator = new WindowAccumulator(
                    id,
                    reader.GetString(1),
                    reader.GetString(2),
                    ParseDateOnly(reader, 3),
                    ParseDateOnly(reader, 4),
                    reader.IsDBNull(5) ? null : reader.GetString(5));
                grouped[id] = accumulator;
            }

            if (!reader.IsDBNull(6))
            {
                accumulator.AccountIds.Add(reader.GetString(6));
            }
        }

        return grouped.Values.Select(window => window.ToRecord()).ToList();
    }

    // start_date/end_date are stored as text (ISO yyyy-MM-dd) to match the app's string handling.
    private static DateOnly ParseDateOnly(NpgsqlDataReader reader, int ordinal) =>
        DateOnly.Parse(reader.GetString(ordinal), System.Globalization.CultureInfo.InvariantCulture);

    private sealed class WindowAccumulator(
        Guid id,
        string name,
        string kind,
        DateOnly startDate,
        DateOnly endDate,
        string? location)
    {
        public List<string> AccountIds { get; } = [];

        public TravelWindowRecord ToRecord() =>
            new(id, name, kind, startDate, endDate, location, AccountIds);
    }
}
