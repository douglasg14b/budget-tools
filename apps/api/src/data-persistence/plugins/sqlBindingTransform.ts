import type { OperationNode, PrimitiveValueListNode, ValueNode } from 'kysely';

/** Coerce values SQLite's driver can bind (booleans and Dates are not supported raw). */
export function coerceSqliteBindingValue(value: unknown): unknown {
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return value;
}

export function transformSqliteQueryBindings(node: OperationNode): OperationNode {
    if (node.kind === 'ValueNode') {
        return transformValueBinding(node as ValueNode);
    }

    if (node.kind === 'PrimitiveValueListNode') {
        const listNode = node as PrimitiveValueListNode;
        const next: PrimitiveValueListNode = {
            ...listNode,
            values: listNode.values.map((value) => coerceSqliteBindingValue(value)),
        };
        return next;
    }

    const transformedNode: Record<string, unknown> = { ...node };

    for (const [key, value] of Object.entries(node)) {
        if (Array.isArray(value)) {
            transformedNode[key] = value.map((item) =>
                item && typeof item === 'object' && 'kind' in item
                    ? transformSqliteQueryBindings(item as OperationNode)
                    : coerceSqliteBindingValue(item),
            );
        } else if (value && typeof value === 'object' && 'kind' in value) {
            transformedNode[key] = transformSqliteQueryBindings(value as OperationNode);
        }
    }

    return transformedNode as unknown as OperationNode;
}

function transformValueBinding(node: ValueNode): ValueNode {
    return {
        ...node,
        value: coerceSqliteBindingValue(node.value),
    };
}
