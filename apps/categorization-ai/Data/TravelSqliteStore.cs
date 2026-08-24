using System.Globalization;
using Microsoft.Data.Sqlite;
using YnabCategoryAi.ML.Travel;

namespace YnabCategoryAi.Data;

public static class TravelSqliteStore
{
    public static (bool Enabled, IReadOnlyList<TravelWindowRecord> Windows) Load(string? sqlitePath)
    {
        if (string.IsNullOrWhiteSpace(sqlitePath))
        {
            return (true, []);
        }

        if (!File.Exists(sqlitePath))
        {
            throw new InvalidOperationException(
                $"SQLITE_DB_PATH was set to '{sqlitePath}' but the file does not exist. Run API SQLite migrations first.");
        }

        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = sqlitePath,
            Mode = SqliteOpenMode.ReadOnly,
        };
        using var connection = new SqliteConnection(builder.ToString());
        connection.Open();

        bool enabled = ReadEnabled(connection);
        if (!enabled)
        {
            return (false, []);
        }

        return (true, ReadWindows(connection));
    }

    private static bool ReadEnabled(SqliteConnection connection)
    {
        using SqliteCommand command = connection.CreateCommand();
        command.CommandText = "SELECT enabled FROM travel_bias_config WHERE id = 1";
        object? value = command.ExecuteScalar()
            ?? throw new InvalidOperationException(
                "travel_bias_config is missing from the API SQLite database. Run API SQLite migrations first.");
        return Convert.ToInt32(value, CultureInfo.InvariantCulture) != 0;
    }

    private static IReadOnlyList<TravelWindowRecord> ReadWindows(SqliteConnection connection)
    {
        using SqliteCommand command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT w.id, w.name, w.kind, w.start_date, w.end_date, w.location, a.account_id
            FROM travel_windows w
            LEFT JOIN travel_window_accounts a ON a.window_id = w.id
            """;

        var grouped = new Dictionary<Guid, WindowAccumulator>();
        using SqliteDataReader reader = command.ExecuteReader();
        while (reader.Read())
        {
            Guid id = Guid.Parse(reader.GetString(0));
            if (!grouped.TryGetValue(id, out WindowAccumulator? accumulator))
            {
                accumulator = new WindowAccumulator(
                    id,
                    reader.GetString(1),
                    reader.GetString(2),
                    DateOnly.Parse(reader.GetString(3), CultureInfo.InvariantCulture),
                    DateOnly.Parse(reader.GetString(4), CultureInfo.InvariantCulture),
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
