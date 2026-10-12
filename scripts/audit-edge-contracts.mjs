// Compatibility entry point: fixed handler regressions now run in normal CI.
// SQL semantics run in pgTAP and localhost Auth integration, not JS mocks.
await import('./test-login-edge.mjs');
await import('./test-member-edge.mjs');
