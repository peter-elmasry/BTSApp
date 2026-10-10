# Progress log

Append entries newest-first. Preserve older entries as the handoff history.

## 2026-10-10 — Git workflow and branch publishing — DONE

- **Requested by:** Gendy.
- **Goal:** Add the requested Git workflow to `AGENTS.md`; diagnose why `codex/phase-1-auth-owner` cannot be published and try to publish it.
- **Initial state:** Current branch is `codex/phase-1-auth-owner`; it had no upstream configured. Working tree was clean at inspection. Remote `origin` points to `https://github.com/peter-elmasry/BTSApp.git`; authentication uses Git Credential Manager.
- **Completed:** Added the Git workflow to `AGENTS.md` and committed it as `1cc93d6 chore: document git workflow and branch publishing`. The existing Phase 1 commit `a2965aa` is also on the published branch.
- **Checks:** Targeted Prettier and `git diff --check` passed for the documentation changes.
- **Publishing diagnosis and resolution:** The initial `git ls-remote` attempt failed because sandboxed network access to GitHub was blocked. After retrying with network access, `git push --set-upstream origin codex/phase-1-auth-owner` succeeded and configured `origin/codex/phase-1-auth-owner` as upstream. Branch is published and ready for a PR.
- **PR URL:** https://github.com/peter-elmasry/BTSApp/pull/new/codex/phase-1-auth-owner

## 2026-10-10 — Name preference for this chat — DONE

- Gendy asked to be called “Gendy” in this chat and in future logs written through this chat. Use that name in future entries and handoffs from this chat.

## 2026-10-10 — Standing documentation rule — DONE

- Gendy asked that Codex and delegated agents keep the coordination files updated whenever work makes them stale.
- `AGENTS.md` now makes coordination updates part of implementation for primary and delegated agents. `COORDINATION.md` includes a reusable pull-and-continue prompt that instructs another device's agent to maintain the log and decision docs too.
- Future substantive sessions continue to use `STARTED`, milestone updates, and `HANDOFF`/`DONE` entries.

## 2026-10-10 — Phase 1 validation and template extraction — HANDOFF

- **Branch:** `codex/phase-1-auth-owner` (changes are local and uncommitted; push/commit status must be checked before another device can fetch them).
- **Scope:** Phase 1 auth and owner area; externalize all Angular component templates; validate against the agreed contracts.
- **Implemented:** Added login and members Edge Functions, profile/owner RPC migration `0004_owner_auth.sql`, Angular auth store and route guards, owner Members/Events screens, translations, and Phase 1 pgTAP permission/idempotency coverage. All component templates under `src/app` now use `templateUrl` and adjacent HTML files.
- **Validation passed:** Production build; initial bundle 322.12 kB (under the agreed 500 kB budget); 10 unit tests across 3 files, including guard coverage; 3 Playwright shell tests (Arabic, English, offline); Lighthouse accessibility 100, best practices 100, performance 68; targeted Prettier on changed files; `git diff --check`.
- **Validation not complete:** `npm run test:db` could not connect to Postgres at `127.0.0.1:54322`; Docker is unavailable. Consequently Phase 1 SQL permission tests, migration execution, Edge Function integration, username/phone login and wrong-password lockout have not been runtime-verified against Supabase. Hosted Supabase/Vercel acceptance remains pending per `PHASE_0_RESULTS.md`.
- **Other check note:** Repository-wide `npm run format:check` flags many pre-existing files; the changed-file Prettier check passes. Initial parallel test execution timed out starting Vitest workers; serial `npm test` passed. Playwright Chromium was installed in the local user cache to run E2E.
- **Decision recorded:** Supabase client import is lazy-loaded from `AuthStore` so the initial app bundle remains below 500 kB.
- **Next:** Start local Supabase on a machine with Docker, run `npx supabase db reset` and `npm run test:db`, fix any migration/pgTAP issues, then exercise Edge Function login and owner/member actions with owner, referee, inactive, and anonymous identities. Preserve Phase 0 hosted acceptance as pending until its checks pass.

## 2026-10-10 — Collaboration record setup — DONE

- Added `AGENTS.md`, this coordination guide, and the progress log. README links to the entry points.
- Going forward, begin each substantive session with a `STARTED` progress entry and update it at milestones and handoff. Never place secret values in docs.
