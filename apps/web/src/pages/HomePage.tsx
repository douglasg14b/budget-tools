import { getHealthOptions } from '@budget-tools/web-sdk';
import { Badge, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';

import { BackendErrorNotice } from '../components/BackendErrorNotice';

export function HomePage() {
    const healthQuery = useQuery(getHealthOptions());

    return (
        <Stack gap="md" p="xl">
            <Title order={1}>Budget Tools</Title>
            <Text c="dimmed">YNAB transaction categorization review</Text>

            {healthQuery.isLoading ? <Text>Checking API health…</Text> : null}
            {healthQuery.isError ? <BackendErrorNotice error={healthQuery.error} /> : null}
            {healthQuery.isSuccess ? (
                <Badge color={healthQuery.data.ok ? 'green' : 'red'} variant="light">
                    API health: {healthQuery.data.ok ? 'ok' : 'unhealthy'}
                </Badge>
            ) : null}
        </Stack>
    );
}
