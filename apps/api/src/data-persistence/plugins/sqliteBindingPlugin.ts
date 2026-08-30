import type {
    ColumnType,
    KyselyPlugin,
    PluginTransformQueryArgs,
    PluginTransformResultArgs,
    QueryResult,
    RootOperationNode,
    UnknownRow,
} from 'kysely';

import { transformSqliteQueryBindings } from './sqlBindingTransform';

/** Result rows may still be snake_case when this plugin runs before CamelCasePlugin. */
function sqliteBoolColumnNames(camelName: string): readonly string[] {
    const snake = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    return snake === camelName ? [camelName] : [camelName, snake];
}

type BooleanOnlyKeys<TSchema> = {
    [K in keyof TSchema]: TSchema[K] extends ColumnType<boolean, 0 | 1, 0 | 1> | boolean ? K : never;
}[keyof TSchema];

type BoolColumns<DB> = {
    [TTable in keyof DB]?: readonly BooleanOnlyKeys<DB[TTable]>[];
};

/**
 * SQLite cannot bind JavaScript booleans or Date objects.
 * Kysely emits both ValueNode and PrimitiveValueListNode parameters — both must be coerced.
 */
export class SqliteBindingPlugin<DB> implements KyselyPlugin {
    private readonly allBoolColumns: Set<string>;

    constructor(boolCols: BoolColumns<DB>) {
        this.allBoolColumns = new Set<string>();
        const columnLists = Object.values(boolCols) as Array<readonly string[] | undefined>;
        for (const columns of columnLists) {
            if (!columns) {
                continue;
            }
            for (const column of columns) {
                for (const name of sqliteBoolColumnNames(String(column))) {
                    this.allBoolColumns.add(name);
                }
            }
        }
    }

    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
        return transformSqliteQueryBindings(args.node) as RootOperationNode;
    }

    async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
        const rows = args.result.rows as Record<string, unknown>[];
        if (!rows.length) {
            return args.result;
        }

        const coerced = rows.map((row) => {
            const copy: Record<string, unknown> = { ...row };
            for (const column of this.allBoolColumns) {
                if (column in copy && copy[column] != null) {
                    const value = copy[column] as number | boolean;
                    copy[column] = typeof value === 'number' ? value === 1 : !!value;
                }
            }
            return copy;
        });

        return { ...args.result, rows: coerced };
    }
}
