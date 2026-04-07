using DotNetEnv;
using Microsoft.Extensions.Configuration;

namespace Lighthouse.API.Infrastructure;

public static class LocalEnvLoader
{
    /// <summary>
    /// Loads the first <c>.env</c> found next to the API project and merges it into configuration so it overrides <c>appsettings</c>.
    /// </summary>
    public static void Apply(IConfigurationBuilder configurationBuilder, string contentRootPath)
    {
        var path = FindDotEnvPath(contentRootPath);
        if (path is null)
            return;

        var options = new LoadOptions(
            setEnvVars: true,
            clobberExistingVars: true,
            onlyExactPath: true);

        var pairs = Env.Load(path, options)
            .GroupBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Last());

        IReadOnlyList<KeyValuePair<string, string?>> memory = pairs
            .Select(kv =>
                new KeyValuePair<string, string?>(
                    kv.Key.Replace("__", ConfigurationPath.KeyDelimiter, StringComparison.Ordinal),
                    kv.Value))
            .ToList();

        configurationBuilder.AddInMemoryCollection(memory);
    }

    private static string? FindDotEnvPath(string contentRootPath)
    {
        var dirs = new List<string>();

        void addDir(string? dir)
        {
            if (string.IsNullOrWhiteSpace(dir)) return;
            try
            {
                var full = Path.GetFullPath(dir);
                dirs.Add(full);
            }
            catch
            {
                /* ignore invalid paths */
            }
        }

        addDir(contentRootPath);

        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
        {
            addDir(d.FullName);
            if (File.Exists(Path.Combine(d.FullName, "Lighthouse.API.csproj")))
                break;
        }

        addDir(Directory.GetCurrentDirectory());
        for (var d = new DirectoryInfo(Directory.GetCurrentDirectory()); d.Parent != null; d = d.Parent)
            addDir(d.Parent.FullName);

        foreach (var dir in dirs.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var candidate = Path.Combine(dir, ".env");
            if (File.Exists(candidate))
                return candidate;
        }

        return null;
    }
}
