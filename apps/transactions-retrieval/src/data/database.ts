import { createDatabase } from '@budget-tools/db';

import { DB_CONNECTION_STRING } from '../environment';

export type { DatabaseClient } from '@budget-tools/db';

export const database = createDatabase({ connectionString: DB_CONNECTION_STRING });
