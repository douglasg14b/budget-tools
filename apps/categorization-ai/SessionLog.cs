using System.Text;
using Serilog;
using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting;
using Serilog.Formatting.Display;

namespace YnabCategoryAi;

/// <summary>
/// Session logging for categorization-ai. Each run truncates
/// <c>logs/last-session.log</c> (cwd-relative) so that file is always the most recent process.
/// </summary>
public static class SessionLog
{
    public const string RelativePath = "logs/last-session.log";

    private const string OutputTemplate = "{Timestamp:HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}";

    private static TextWriter? _stdout;
    private static TextWriter? _stderr;

    public static string Start(bool jsonStdout)
    {
        _stdout = Console.Out;
        _stderr = Console.Error;

        string path = Path.GetFullPath(RelativePath);
        string? directory = Path.GetDirectoryName(path);
        if (directory is not null)
        {
            Directory.CreateDirectory(directory);
        }

        if (File.Exists(path))
        {
            try
            {
                File.Delete(path);
            }
            catch (IOException)
            {
                // Another process (e.g. serve mode) may hold the log open; append instead.
            }
        }

        var formatter = new MessageTemplateTextFormatter(OutputTemplate);
        TextWriter console = jsonStdout ? _stderr : _stdout;

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(
                path,
                shared: true,
                flushToDiskInterval: TimeSpan.FromSeconds(1),
                encoding: Encoding.UTF8,
                outputTemplate: OutputTemplate)
            .WriteTo.Sink(new TextWriterSink(console, formatter))
            .CreateLogger();

        if (jsonStdout)
        {
            Console.SetError(new SerilogTextWriter());
        }
        else
        {
            Console.SetOut(new SerilogTextWriter());
        }

        Log.Information("Session log {Path}", path);
        return path;
    }

    public static async Task ShutdownAsync()
    {
        await Log.CloseAndFlushAsync();
        if (_stdout is not null)
        {
            Console.SetOut(_stdout);
        }

        if (_stderr is not null)
        {
            Console.SetError(_stderr);
        }
    }

    /// <summary>
    /// Writes formatted log events to a captured console stream (avoids recursion with Console.SetOut).
    /// </summary>
    private sealed class TextWriterSink : ILogEventSink
    {
        private readonly TextWriter _writer;
        private readonly ITextFormatter _formatter;
        private readonly object _sync = new();

        public TextWriterSink(TextWriter writer, ITextFormatter formatter)
        {
            _writer = writer;
            _formatter = formatter;
        }

        public void Emit(LogEvent logEvent)
        {
            lock (_sync)
            {
                _formatter.Format(logEvent, _writer);
                _writer.Flush();
            }
        }
    }
}

/// <summary>
/// Routes <see cref="Console"/> / diagnostics writes through Serilog (file + console).
/// </summary>
public sealed class SerilogTextWriter : TextWriter
{
    private readonly StringBuilder _buffer = new();

    public override Encoding Encoding => Encoding.UTF8;

    public override void Write(char value)
    {
        if (value == '\n')
        {
            FlushLine();
            return;
        }

        if (value != '\r')
        {
            _buffer.Append(value);
        }
    }

    public override void Write(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return;
        }

        int start = 0;
        for (int i = 0; i < value.Length; i++)
        {
            char c = value[i];
            if (c == '\n')
            {
                if (i > start)
                {
                    _buffer.Append(value, start, i - start);
                }

                if (_buffer.Length > 0 && _buffer[^1] == '\r')
                {
                    _buffer.Length--;
                }

                FlushLine();
                start = i + 1;
            }
        }

        if (start < value.Length)
        {
            _buffer.Append(value, start, value.Length - start);
        }
    }

    public override void WriteLine(string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            Write(value);
        }

        FlushLine();
    }

    public override void Flush() => FlushLine();

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            FlushLine();
        }

        base.Dispose(disposing);
    }

    private void FlushLine()
    {
        if (_buffer.Length == 0)
        {
            return;
        }

        string line = _buffer.ToString();
        _buffer.Clear();
        if (!string.IsNullOrWhiteSpace(line))
        {
            Log.Information("{Message}", line);
        }
    }
}
