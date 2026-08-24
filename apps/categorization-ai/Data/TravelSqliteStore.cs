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
            SELECT id, name, kind, start_date, end_date, account_id
            FROM travel_windows
            """;

        var windows = new List<TravelWindowRecord>();
        using SqliteDataReader reader = command.ExecuteReader();
        while (reader.Read())
        {
            windows.Add(
                new TravelWindowRecord(
                    Guid.Parse(reader.GetString(0)),
                    reader.GetString(1),
                    reader.GetString(2),
                    DateOnly.Parse(reader.GetString(3), CultureInfo.InvariantCulture),
                    DateOnly.Parse(reader.GetString(4), CultureInfo.InvariantCulture),
                    reader.IsDBNull(5) ? null : reader.GetString(5)));
        }

        return windows;
    }
}
