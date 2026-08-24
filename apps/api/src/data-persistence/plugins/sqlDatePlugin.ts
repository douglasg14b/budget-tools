import type {
    ColumnType,
    KyselyPlugin,
    PluginTransformQueryArgs,
    PluginTransformResultArgs,
    QueryResult,
    RootOperationNode,
    UnknownRow,
} from 'kysely';

type DateOnlyKeys<TSchema> = {
    [K in keyof TSchema]: TSchema[K] extends ColumnType<Date | null, unknown, unknown> | Date | null ? K : never;
}[keyof TSchema];

type DateColumns<DB> = {
    [TTable in keyof DB]?: readonly DateOnlyKeys<DB[TTable]>[];
};

export class SqlDatePlugin<DB> implements KyselyPlugin {
    private readonly allDateColumns: Set<string>;

    constructor(private readonly dateCols: DateColumns<DB>) {
        this.allDateColumns = new Set<string>(Object.values(this.dateCols ?? {}).flat() as string[]);
    }

    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
        return args.node;
    }

    async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
        const rows = args.result.rows as Record<string, unknown>[];
        if (!rows.length) {
            return args.result;
        }

        const coerced = rows.map((row) => {
            const copy: Record<string, unknown> = { ...row };
            for (const column of this.allDateColumns) {
                if (column in copy && copy[column]) {
                    copy[column] = new Date(copy[column] as string);
                }
            }
            return copy;
        });

        return { ...args.result, rows: coerced };
    }
}
