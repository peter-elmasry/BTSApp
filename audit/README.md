# Requirements audit diagnostics

These opt-in checks expose unmet requirements found on 2026-10-11. They are
separate from the existing `e2e/` suite and are expected to fail until the findings
in `docs/IMPLEMENTATION_AUDIT.md` are fixed. A red result must not be treated as
successful acceptance. No production code or CI assertion was relaxed for this audit.

Use Node 24 and the repository's installed development dependencies. Build a
shell-only production preview with `node scripts/set-env.mjs --allow-empty` when
the public environment variables are unset, then `npm run build`. All fixtures
expect the generated client's local fallback URL. Do not point these diagnostics
at production; do not change an existing environment file without preserving it.

Run `npm run serve:dist` in another terminal, then:

```sh
node scripts/audit-edge-contracts.mjs
npx playwright test --config=audit/playwright.config.ts
node scripts/audit-performance.mjs
```

For an existing local preview on another port, set `BTS_AUDIT_URL` to its origin.
The browser/performance diagnostics reject non-local origins. The browser suite
uses synthetic members and mocked RPC/Auth requests. The Edge probe transpiles
and executes the actual handlers with a simulated database/Auth transport;
it never reads credentials or sends requests. These do not replace real Supabase
permission tests, Edge integration or hosted acceptance.

The A02/A03 handler regressions now also run in CI through `npm run test:edge`.
Lockout deadlines/concurrency and atomic member/audit writes are covered by new
pgTAP suites and the existing localhost Auth runner's handler integrations.
Those require a running local Supabase instance. The original failing Edge probe
command above delegates to the maintained regression suites; historical failure
evidence remains in the audit report. Browser/performance gaps remain open.

The performance diagnostic measures a cold team-picker render under an explicit
400 ms latency, 1.6 Mbps down / 750 kbps up and 4× CPU slowdown at 390×844. It
blocks the service worker and mocks the public event backend. The repository's
local server serves uncompressed assets, so results are a local regression
baseline, not a hosted timing claim or a physical mid-range Android measurement.
It writes `artifacts/audit-performance.json` and exits nonzero above 4 seconds.

On Windows, Playwright may finish assertions but wait indefinitely for its
test-owned preview server to tear down. Stop only that specific server after all
tests finish. Avoid stopping an existing development server.
