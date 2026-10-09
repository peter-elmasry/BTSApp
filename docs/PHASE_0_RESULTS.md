# Phase 0 — Foundations acceptance

Branch: `phase-0-foundations`. Phase 0 is **pending external acceptance**; do not start Phase 1.

## Delivered

- Agreed §5 schema in `0001_schema.sql`, permission/audit/broadcast/idempotency helpers in `0002_helpers.sql`, deny-by-default RLS/grants/indexes in `0003_rls.sql`.
- Environment generation, idempotent owner seed script (environment secrets only), local Supabase config.
- Arabic-default Transloco with persisted EN/AR and RTL/LTR, self-hosted Cairo, exact Tailwind tokens, mobile header and bottom navigation.
- `ds-button`, `ds-input`, `ds-select`, `ds-toggle`, `ds-card`, `ds-avatar`, `ds-toast`, `ds-bottom-sheet`; Reactive Forms CVAs, focus containment/restoration through native dialog.
- White/navy full logo and cropped mark PNG/WebP, favicon, 192/512/maskable icons; 24 original SVG emblems and bilingual catalog.
- Service worker, manifest, SPA hosting/cache configuration, CI frontend and local Supabase database jobs, deploy and weekly keepalive workflows.

## Acceptance evidence

| Criterion                                                              | Result                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Production build / output                                              | Passed; initial 314.30 kB, `dist/btsapp/browser/index.html` exists                                                  |
| Unit tests                                                             | 5 passed (shell and language/direction persistence)                                                                 |
| 360×740 Arabic/English, switch/reload, no overflow, ≥44px controls     | Passed in Chromium                                                                                                  |
| Automated accessibility                                                | No axe violations in either language                                                                                |
| Header white DST mark / crop                                           | Passed; generated mark visually inspected, no tagline pixels                                                        |
| Offline / Lighthouse                                                   | Offline reload passed; local Lighthouse accessibility 100, best practices 100, performance 66; PWA category removed |
| Supabase migrations and permission suite                               | Authored, not executed against Supabase: Docker/Podman missing locally                                              |
| Linked hosted project / owners seeded / exact synthetic domain sign-in | Pending project credentials and owner passwords                                                                     |
| GitHub CI green                                                        | Pending published PR workflow results                                                                               |
| Vercel deployment / hosted Lighthouse                                  | Pending Vercel project/environment configuration                                                                    |

The SQL suite exercises all foundation helpers as anonymous, owner, event admin, assigned/unassigned referee, guide, unassigned member and inactive admin; cross-event isolation, public/hidden outcomes, direct table grants and actual denied requests, internal helper revocation, actor/RPC-bound replay. Later phases add their mutation RPC tests and scoring/lifecycle suites; this phase does not claim those nonexistent RPCs were tested.

## Product owner follow-up

Expected attendance is usually below the plan's capacity envelope (confirmed during implementation). These are planning figures, never hardcoded limits. A separate preview Supabase project must be identified before preview deployment. Current Lighthouse has removed the PWA category; the documented replacement checks are manifest, service-worker control, installability and real offline navigation, alongside accessibility ≥90. No data-loss or security expansion decision is required.
