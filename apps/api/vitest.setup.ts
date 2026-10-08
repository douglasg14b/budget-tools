import { blockRemoteNetwork, stripRemoteEnv } from '@budget-tools/shared-node';

// Runs before every API test file. .env.local is production, so nothing a test does may
// reach a remote host, even if the shell (or a `dotenvx run -f .env.local`) supplied one.
stripRemoteEnv();
blockRemoteNetwork();
