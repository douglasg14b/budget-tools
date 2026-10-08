import { blockRemoteNetwork, stripRemoteEnv } from '@budget-tools/shared-node';

// `pnpm test:live` only: the OpenRouter key and host stay reachable; the database, S3, YNAB
// and everything else in .env.local is stripped and blocked exactly as in `pnpm test`.
stripRemoteEnv(['OPENROUTER_API_KEY']);
blockRemoteNetwork(['openrouter.ai']);
