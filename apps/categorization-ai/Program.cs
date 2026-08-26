using YnabCategoryAi;

if (args.Length > 0 && args[0].Equals("serve", StringComparison.OrdinalIgnoreCase))
{
    return await PredictServer.RunAsync(args);
}

return await PipelineRunner.RunAsync(args);
