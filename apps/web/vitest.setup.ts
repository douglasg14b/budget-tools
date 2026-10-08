import { blockRemoteNetwork, stripRemoteEnv } from '@budget-tools/shared-node';

// Runs before every web test file: no remote-pointing env, no non-loopback connections.
stripRemoteEnv();
blockRemoteNetwork();
