# Progress log

Append entries newest-first. Preserve older entries as the handoff history.

## 2026-10-15 — Team invites and reversible player registration — STARTED

- **Requested by:** Gendy; implement the approved name-required/phone-optional invite flow, remembered one-team membership, guide-scoped rosters and reversible corrections without player accounts or OTP.
- **Preflight:** Clean workspace; fetched origin and branched `codex/team-invite-registration` from current master `76b4af5` (includes PR #32). No existing changes overwritten.
- **Scope:** Private registration/invite schema and RPC permissions, persistent device receipts, public join form, guide/admin roster/link controls, edit/remove/restore/admin transfer and previewed batch rollback/restore, EN/AR and focused SQL/unit/browser tests. Preserve ordinary unregistered team selection and existing staff authentication/logout conventions.
- **Next:** Implement audited server mutations and online-only private reads, then integrate UI and verify local/cloud checks. No merge or production event writes authorized.
- **Milestone:** Added migration 0029/private receipt and roster RPCs, EN/AR join and guide/admin screens, restricted guide choices, 15-second foreground receipt reconciliation and preview/version-safe individual/batch corrections. Browser storage holds no name/phone. D064 and plan §23 record agreed behavior and cleared-storage limitations; runbook covers recovery.
- **Checks so far:** Production build passed (456.68 kB initial); app/spec TypeScript and 1,113-key EN/AR parity passed. Thirty focused receipt/selection/session unit tests passed. Initial browser run passed guest/receipt/guide cases; longer multi-step roster tests reached transfer before the 30-second test budget expired, now being rerun with a scoped 60-second budget and role-based select locator. SQL runtime and full regression checks remain pending.
- **Verification milestone:** All 21 registration/existing-player/privacy browser journeys passed (including EN/AR accessibility, phone retry, online recovery, link controls, guide scope, transfer and individual/batch undo); EN/AR mobile screenshots inspected. Full unit run passed 256/257; unchanged XLSX export cold-load test hit its existing 30-second limit and its separate rerun passed all five assertions. Edge checks passed (22 login + 34 member). Local SQL is blocked by absent Supabase on 127.0.0.1:54322 (after a telemetry-permission retry); added 63 pgTAP checks for cloud execution. Final build/format/diff inspection precede commit/publication; full cloud acceptance remains required.
- **Publication:** Feature commit `9d8e57f` pushed as PR #33 against master; Vercel preview succeeded and CI `38802322676` is queued. GitHub connector PR creation lacked write permission; existing repository Git credentials succeeded without recording secrets. Final review tightened post-lock permission rechecks/consistent lock order, corrected the SQL trailing blank and assertion-count wording; these follow-up changes await commit. No merge or production writes.
- **Follow-up:** Published lock/permission hardening as `eab2a8b`; its cloud formatting, translations, Edge checks, all unit tests and production build passed; browser/SQL jobs continue. Added browser Web Lock serialization plus shared-receipt re-read for simultaneous guest tabs and a real two-tab regression; final focused checks precede publication of that guard.
- **Cloud/runtime milestone:** CI `38802493547` applied/reset migration 0029 and passed all prior SQL suites plus the first 59 new assertions. The expiry/finished/burst section retained the preceding owner JWT while changing to SQL role anon, so its staff-join rejection was correct; clear the test JWT before those guest cases. No SQL permission weakening. Local final two-tab guard checks passed: all 11 feature browser tests and 8 receipt unit tests, plus build/TypeScript/formatting. Publish the guard and test-fixture repair, then verify fresh full cloud CI.

## 2026-10-15 — Resolve latest fix PR conflicts — HANDOFF

- **Requested by:** Gendy; resolve the latest PR conflict.
- **Preflight:** Clean codex/round-audio-home-fixes at 609f660; fetched origin. PR #32 is conflicted after PR #31 merged into master df720de. Existing PR #32 frontend/database/Vercel checks pass. No unrelated workspace edits.
- **Scope/next:** Merge current master into the existing PR branch without rewriting published history. Preserve both progress histories, incoming logout-test correction and the round-audio/Home fixes; inspect actual conflicts, run appropriate formatting/whitespace and regression checks, push and verify updated CI/mergeability. This request does not authorize merging PR #32 into master or changing the live event.
- **Resolution/checks:** Only docs/PROGRESS_LOG.md conflicted; retained both chronological sections and the current session entry. Incoming EVENT_DAY_RUNBOOK.md and e2e/privacy.spec.ts match master's versions; no application/assets/migration differences from PR #32's pre-merge head. All three EN/AR privacy/logout browser tests passed, and changed-file Prettier/whitespace checks passed. No new runtime change requiring a local rebuild.
- **Publication/handoff:** Commit and push this master-to-feature merge to existing PR #32, verify GitHub reports mergeable and inspect its fresh CI/Vercel checks. No force push or PR merge/deployment; local test server stopped. Next product action remains review/authorization of PR #32's existing sound/Home fixes once checks pass.

## 2026-10-15 — Reliable round sound and anonymous Home navigation — HANDOFF

- **Requested by:** Gendy reports no MP3 cue when admins finish/start rounds and intermittent anonymous Home taps doing nothing. Round cues must reach every viewer role after explicit device sound activation.
- **Preflight:** Clean deployment-record branch; fetched origin and created codex/round-audio-home-fixes from deployed master 9b4d75e. PR #31 remains separate; preserve its test correction and deployment record.
- **Findings/scope:** Home currently redirects unselected visitors back to choose-team, making the Home link a silent same-page navigation. Keep initial root/QR selection rules but allow explicit Home to render its existing choose-team prompt. Audio currently reads fresh round cues only for the dedicated round_audio message when the socket reports subscribed; a missed/custom broadcast has no independent recovery despite ordinary round_changed signals. Reproduce missing broadcast recovery, then cover admins/anonymous viewers and committed close/start ordering without live production result writes.
- **Next:** Add regression coverage, fix verified delivery/navigation gaps, run relevant unit/browser/build and cloud checks, publish a separate PR. Browser consent, mute and historical/stale-cue suppression remain required; no unsolicited production event mutations.
- **Implementation milestone:** Explicit Home now renders its existing pick-team prompt without redirecting back to the same picker; root/QR/staff and schedule/detail guards are retained. Round cues verify on normal round updates, successful write cache invalidation and a two-second foreground recovery check even with a subscribed socket. Fresh cues arriving while MP3s prepare are queued instead of discarded; mute/freshness/deduplication remain enforced. D063 and plan §22 record the amended behavior. No database migration or permission expansion.
- **Local checks:** Production build passed (below 500 kB), spec TypeScript and 1,034-key translation parity passed. All 19 focused audio/buffering/guard unit tests passed. Browser audio/player suite passed 20/22; both new Home tests initially used the wrong translation lookup, corrected to existing flat keys, then both passed. Includes actual admin close/start actions without broadcasts, owner/admin/referee no-team round playback, subscribed-but-missed broadcast recovery, consent/mute, own results, two tabs and EN/AR/QR/lock behavior. No live production scoring writes were made.
- **Publication next:** Inspect/publish this isolated fix PR against master and verify full cloud CI/Vercel preview. The fix is not deployed until separately authorized to merge; prior merge authorization covered PR #30.
- **Cloud acceptance/publication:** PR #32 at runtime head 5f0c452 passed both jobs in run 38768748331; Vercel preview GTY79DbYGLm1BxnpBGgXXFYyibuM succeeded. Final documentation records that acceptance. No production event changes or deployment of this fix occurred. Next: explicit authorization to merge PR #32, verify its master deployment, then ask each device to enable sound and rehearse committed start/end cues. Physical background/autoplay restrictions still constrain delivery; app tests do not claim forced playback without activation.
- **User-requested retest:** After Gendy reported Sound enabled for gendui, repeated admin close/start and owner/admin no-team MP3 journeys three times each: 9/9 passed using isolated fixtures. MP3 PCM analysis confirms audible data starts at ~0.133 s for round-start and ~0.025 s for round-end, with peaks ~0.56/~0.80; the four-second playback cap does not explain silent round clips. Rechecked production: still master 9b4d75e; PR #32 final head fa5c0e9 has passing CI/Vercel but remains unmerged. Browser inventory contains no connected signed-in gendui tab, so this is not a direct verification of that account's device/session. No runtime changes or live round mutations during retest; local test server stopped.

## 2026-10-15 — Authorized release merge and deployment — HANDOFF

- **Requested by:** Gendy explicitly authorizes merging PR #30 after its final checks and continuing deployment.
- **Preflight:** Clean codex/media-audio-release at 97ea07d; fetched origin. PR #30 remains mergeable. Vercel now reports a successful preview g25DRhtW8S9YUBCKDV2BJmAvNjvp; the prior access blocker is no longer present on this head. Final CI run 38764411469 is still running frontend/database checks.
- **Scope/next:** Wait for both jobs to pass, merge the verified SHA without rewriting history, then inspect master CI, production Supabase deployment and Vercel production status. Record observed deployment evidence; do not infer hosted or physical-device acceptance from CI alone.
- **Merge milestone:** Final PR CI 38764411469 passed frontend/database and Vercel succeeded. Merged PR #30 through the guarded GitHub endpoint at exact approved head 97ea07d, producing master 9b4d75e. Automatic master CI 38765044072 and Deploy Supabase 38765043986 started; Vercel deployment 4EzLFAQZZBHeZdq7hcxyx5Wbr4LH is pending. Continuing on codex/release-deployment-record for the shared handoff without editing master directly.
- **Deployment milestone:** Production workflow 38765043986 succeeded; logs confirm applying migrations 0024–0028, completed db push and login/members Edge deployment. Vercel succeeded on the same master SHA. Public domain https://dst-scoring.vercel.app (also confirmed by Gendy) serves anonymous home/display/service-worker manifest and all five audio files with expected MIME/size; deployment-specific URLs remain Vercel-auth protected.
- **Hosted smoke:** Real, unmocked mobile Chromium EN/AR choose-team journeys show 12 teams, zero page errors/RPC failures/overflow, visible consent and zero pre-consent sound requests. Explicit EN opt-in loads all five MP3s. No live scoring/event mutations submitted; screenshots/report are ignored artifacts/hosted-release-*.
- **CI follow-up scope:** Master database job passed. Frontend ran 237 passing unit tests and 108/109 browser tests; D047 logout test failed with JSON parsing of an empty second window.name read after its polling read had succeeded. Fix the test's snapshot sampling atomically within polling and verify repeated reload coverage; do not infer a production logout defect from this failure. Publish this isolated test correction with the deployment handoff; merge authorization applies to PR #30 only.
- **Follow-up checks:** Corrected e2e/privacy.spec.ts to parse/assert one snapshot sample inside polling, preserving the exact language-only local-storage and empty-session assertions. Ten repeated real-browser logout journeys passed. EN/AR hosted screenshots were inspected; the public event response includes audio_config. No application runtime changes are part of this fix.
- **Hosted timing:** Real production public reads under 400 ms latency, 1.6 Mbps down/750 Kbps up and 4x CPU slowdown took EN 6,356 ms / AR 6,329 ms to show team cards (390x844, empty cache, service worker blocked). The 4-second target is still not met; ignored report artifacts/hosted-release-performance.json records conditions. This is simulated Chromium, not a real Android/iPhone result.
- **Publication/next:** Commit/push the checked test correction and deployment handoff on codex/release-deployment-record, open its PR, verify cloud CI and rerun master's failed frontend job without erasing the first failure. PR #30 merge and database/frontend deployment are complete. Follow-up PR merging needs separate authorization; physical-device/venue rehearsal, loading-performance work and printable QR sheets remain open. No live event results/configuration were mutated by the hosted checks.
- **Final cloud acceptance:** Published test correction eb16514 as PR #31. Its run 38766176404 passed both jobs; master run 38765044072 attempt 2 also passed both jobs after the initial snapshot-test failure (retained in attempt 1). Thus deployed master 9b4d75e has successful database/frontend CI and production deployments. This final documentation-only commit records the completed checks; any automatic follow-up run is separate from the verified runtime/test change. PR #31 remains unmerged, with no additional runtime changes or production writes.

## 2026-10-15 — Release integration and deployment readiness — HANDOFF

- **Requested by:** Gendy; proceed with combined CI, database/frontend deployment and readiness checks after the past PRs were merged.
- **Preflight:** Clean codex/event-audio; fetched origin. PRs #24–#29 are merged, but only #24 targeted master. Master is d7e9867 with migrations through 0023; later PRs landed on their stacked bases, so deploying master would omit the features. Current master CI 38760674574 passed; no new production migration run exists.
- **Scope/milestone:** Created codex/media-audio-release from origin/master and integrated origin/codex/team-colour-palette, which includes the merged audio slice. Only conflicts are additive progress history and sounds ignore patterns; preserve both histories and both ignore patterns. No application code conflict. Publish one combined integration PR and verify its full CI before requesting its merge; deployment requires the combined code on master.
- **Validation milestone:** Combined source/database trees match the completed feature branch exactly; differences are only progress history and the preserved placeholder ignore pattern. Changed-document formatting, 1,034-key translation parity and whitespace checks pass. Local production build passed at 452.24 kB initial.
- **Publication/acceptance:** Integration PR #30 targets master; runtime head e1650c1 passed both jobs in cloud run 38763511403 (237 unit tests, 109 browser tests, 1,037 database assertions across 20 files, plus build/Edge/translation/format/Lighthouse and owner/Auth checks). Final documentation records this outcome; its automatic follow-up CI may still be pending. New Vercel preview 4s1BTAr4apR5Ap2S2R9SxLjtiHkp remains blocked; GitHub supplies no detailed reason. Current master has not received or deployed the feature migrations.
- **Readiness measurement:** Existing simulated 3G audit failed its 4-second target: EN 8,709 ms, AR 9,041 ms (400 ms latency, 1.6 Mbps down, 4x CPU slowdown, mocked backend, uncompressed local production assets, service worker disabled). Report is ignored artifacts/audit-performance.json. This is not a hosted or physical-device measurement; loading-performance acceptance remains open.
- **Next/authorization:** Request explicit merge authorization for new integration PR #30 under AGENTS.md; earlier merged PRs do not integrate themselves into master. After merge, verify master CI and production Supabase workflow for migrations 0024–0028, and resolve Vercel's private dashboard blocker before hosted rehearsal. Gendy's proceed instruction authorizes deployment follow-through, not billing/visibility/identity changes. Real Android/iPhone/venue rehearsal, hosted performance and printable QR sheets remain open readiness work. The local audit server was stopped; branch is committed/pushed, with no production data or deployment changes in this session.

## 2026-10-15 — Planning PR CI repair — HANDOFF

- **Requested by:** Standing requirement to publish checked logical changes and verify the whole PR chain.
- **Preflight:** Clean planning branch at 335c846, fetched origin; master remains a774e36. Implementation is on stacked PRs #25–#29; no merges performed. Audio frontend passed and its public-contract assertion fix is rerunning separately.
- **Scope:** Ignore the empty sounds placeholder (and the ignore file itself) in Prettier. Align final diagnostic artifact upload with D062's existing best-effort policy because account artifact quota is exhausted; product checks stay strict.
- **Checks:** Changed-file formatting (including the explicitly ignored placeholder/ignore file), YAML parsing via Prettier and git diff whitespace checks passed. Runtime code is unchanged; full cloud checks follow publication.
- **Next:** Commit/push this isolated CI repair to PR #24; verify cloud while returning to the final implementation branch. Preserve published history.

## 2026-10-15 — Retry Vercel after approved access — HANDOFF

- **Requested by:** Gendy confirms the Vercel access request was approved and asks to retry.
- **Preflight/scope:** Clean codex/event-audio; refreshing origin and the current deployment statuses. Existing blocked statuses do not automatically prove whether approval has taken effect. Trigger a fresh PR #29 preview through this progress commit, then retry the remaining preview branches if access is recognized. No merge or production deployment.
- **Retry/result:** Progress commit 77481bd was pushed to PR #29 and created fresh Vercel deployment GQziXhBV7sK9joUTgrPgXpHBEY7N. It failed at 2026-10-15 10:49:22 UTC with only Deployment was blocked exposed by GitHub. The older membership comment still references 7e3eb7b; it is not evidence that the new attempt has the same specific cause. Remaining five branches were not retriggered while this common access question remains unresolved.
- **Checks/access:** Changed-document Prettier and whitespace checks passed. GitHub CI run 38722970262 is in progress; hosted acceptance is not passed. No local Vercel CLI session or accessible authenticated dashboard is available. Requested the new deployment's detailed reason from Gendy; next resolve that reason and retry previews. No merge or production deployment occurred.

## 2026-10-15 — Diagnose blocked Vercel previews — HANDOFF

- **Requested by:** Gendy; investigate and fix the failing Vercel deployment checks across PRs #24–#29 where possible.
- **Preflight:** Clean codex/event-audio at 7e3eb7b; fetched origin and read the coordination/design records. Scope is deployment status/access diagnosis and maintainer instructions; no merge or production deployment.
- **Finding:** All six current PR heads pass frontend/database CI. Vercel rejects author Gendyadel's access to the owning peter-elmasry's projects team; explicit author-access failures appear on #24/#26 and Vercel's bot explains the same missing membership on #24/#25/#26/#28/#29. #27 reports the generic blocked status, consistent with the same author/team, without its own detailed membership comment.
- **Documentation:** Added account-level remedies and preview verification steps to EVENT_DAY_RUNBOOK.md, verified against Vercel's current official collaboration guide. No application-code fix is indicated by these statuses.
- **Checks/publication:** Changed-document Prettier and git diff --check passed. Documentation-only diagnosis is being committed/pushed to existing PR #29; its new cloud run may still be pending at handoff. Runtime suites were not rerun locally for this documentation change.
- **Access/next:** Vercel membership/plan cannot be verified or repaired with the available GitHub credential; browser inspection initialization also failed. The project owner must choose/complete the membership or deployment-ownership remedy, then redeploy previews and inspect their build logs. No billing, visibility, identity, merge or deployment changes made.

## 2026-10-15 — Consent-based event audio — DONE

- **Requested by:** Gendy; explicit Enable sound / Keep muted permission first, immediate committed round cues and selected-team result sounds, including half-heart draws.
- **Preflight:** Palette committed/pushed as 8b92e64, PR #28; branch codex/event-audio stacked on it. Preserved supplied five MP3 clips; .gitkeep removal remains a concurrent workspace change. Attachments frontend is green; database startup still pending.
- **Scope:** Event sound switches, fresh round occurrence records/thin realtime path and polling reader, fresh selected-team result reader, device opt-in/unlock/preload/mute/volume and single audible tab, stale/duplicate/history suppression, lazy sound caching and meaningful tests.
- **Milestone:** Added migration 0028 for boolean event switches, fresh round occurrences/thin broadcasts, polling reader and visibility-aware selected-team result reader. Explicit device consent creates/resumes Web Audio before preloading the supplied clips; mute/volume, foreground-only playback, Web Lock/lease leadership, bounded priority queue and server-time freshness/history/duplicate suppression are integrated. Venue display is round-only. Sound clips are capped at 4 seconds to keep consecutive announcements fresh; service-worker audio caching is lazy.
- **Review fixes:** Record result action-time/config snapshots so blocked transactions and off/on toggles cannot misclassify fresh or disabled outcomes. Keep separate retry status for round/result reads and verify fallback lease ownership before playback. Venue testing exposed an existing display-route redirect under hidden standings; the shell now stays accessible while reader/template result gates remain enforced. Pending team-change responses are discarded by generation checks.
- **Checks:** Production build, app/spec TypeScript, 1034-key translation parity and all 20 focused audio/realtime tests passed, including pending-response cancellation. Seven initial real-browser journeys passed using actual MP3s. Expanded route/privacy checks passed 16/17 with one intermittent third-result playback assertion; its fresh response was verified in the trace and six focused repeat runs passed. Venue round-only/master-off checks now pass; full cloud browser acceptance is still required. Mocked desktop cue-to-playback latency assertion passed below 1 second. Physical Android/iOS, venue speakers and production latency have not been tested. New pgTAP suite awaits cloud.
- **Publication/acceptance:** PR #29 on codex/event-audio, runtime head 69e7354, passed both jobs in run 38719869198: 237 unit tests, 109 browser tests and 1,037 pgTAP assertions across 20 files, plus migrations/reset, owner/Auth integration, Edge regressions, translations, formatting, build and Lighthouse. Initial production bundle is 452.24 kB (<500 kB). The full browser suite passed twice, including the earlier intermittent result case.
- **Planning-chain repair:** Audited all six PR checks. PR #24's placeholder had no Prettier parser; isolated repair 97fccba ignores the placeholder/ignore file and applies the existing D062 artifact policy. Run 38720018288 passed both jobs. PRs #25–#28 remain green. No merges or production deployment were performed.
- **Assets/next:** Supplied clips are committed under public/sounds: round-start.mp3, round-end.mp3, match-win.mp3, match-loss.mp3, match-draw.mp3; their supplied placeholder removal is preserved. Final documentation commit records this acceptance. Next: explicit merge/deployment authorization and real Android/iOS/venue rehearsal from EVENT_DAY_RUNBOOK.md; public asset retention/cleanup limitations remain documented in D058/D059.
- **Cloud milestone:** PR #29 at 97877c9 passed the full frontend job, including all browser tests. All new audio SQL assertions passed; the sole database failure was the older public-event allowlist missing the intentional audio_config field. Updating that contract regression and rerunning CI. Mobile EN consent and AR active controls were visually inspected; an EN screenshot-only helper exceeded its capture timeout, while the production browser suite passed.

## 2026-10-15 — Named HEX team palette — DONE

- **Requested by:** Gendy's configuration/HEX implementation plan.
- **Preflight:** Attachment slice committed/pushed as 939ba97, PR #27; cloud pending. Branch codex/team-colour-palette is stacked on it. Team-picture PR #26 is cloud-verified; sound assets remain preserved.
- **Scope:** Audited/idempotent event palette RPC, validated named HEX entries, Settings editor, reusable single/bulk team swatches and exact named-colour XLSX round trip with earlier template compatibility.
- **Milestone:** Migration 0027 and Settings editor support up to 32 unique name/HEX entries, with normalization and scoped/idempotent audit. Single/bulk setup reuse configured swatches. Workbook dropdown/list and conditional formatting include escaped custom labels and parse back to HEX; layout/version remains v6.
- **Checks:** Production build, app/spec TypeScript and 1007-key translation parity passed; both EN/AR save/reuse/duplicate browser journeys and all 27 focused palette/bulk/workbook unit tests passed. New pgTAP coverage awaits cloud.
- **Cloud:** PR #28 frontend passed on 8b92e64. Its tie-baseline assertion failed because roster insertion clears initial tie values; fixture corrected in 18e196d and pushed without rewriting history. Run 38715646473 passed frontend and database (993 pgTAP assertions). No merge performed.
- **Next:** Consent-based audio using the supplied clips.

## 2026-10-15 — Public opening attachments — DONE

- **Requested by:** Gendy's approved image/PDF implementation plan.
- **Preflight:** Team-picture feature committed/pushed as 87a3a96, PR #26; cloud run 38711368712 is in progress. Branch codex/opening-attachments is stacked on it. Concurrent sound assets remain untouched.
- **Scope:** Migration 0026, event-scoped public image/PDF storage, audited attachment RPC and visible-only public projection, independent opening editor and shared public card before team/login gates.
- **Milestone:** Added attachment editor for existing OPENING rounds (including active/closed rounds), shared public card above the route outlet, MIME/path/size/signature validation, safe PDF preview/open fallback and public-file warning. Migration scopes storage to a matching OPENING round and excludes hidden metadata from bootstrap. Old files use D059's conservative retention pending safe queued-write-aware cleanup.
- **Checks:** Production build, spec TypeScript and 999-key translation check passed. Four EN/AR browser journeys passed (no team/login, display mode, PDF upload/publish/hide/remove, invalid PDF). Visually inspected mobile EN/AR. All 3 attachment unit tests passed after correcting the fake File.slice implementation. New pgTAP suite awaits cloud execution.
- **Cloud:** PR #27 at 939ba97 passed both jobs in run 38712842027, including 975 pgTAP assertions. Supabase container startup took longer than usual before checks ran. No merge performed.
- **Next:** Palette and audio slices continue above.

## 2026-10-15 — Uploadable team pictures — DONE

- **Requested by:** Gendy's implementation instruction; next MEDIA_AUDIO_PLAN slice after PR #25 cloud acceptance.
- **Preflight:** Clean cloud-verified hearts branch 76c18c5; fetched origin. Branch codex/team-pictures is stacked on codex/half-heart-scoring; no merge performed.
- **Scope:** Optional team image_path, public team-images Storage with event-admin/owner write scope, preservation on import, shared picture/avatar fallback and prepared-image upload/preview/remove in Setup. Reuse existing WebP conversion and cover permissions plus real browser upload/fallback.
- **Milestone:** Migration 0025 adds scoped WebP Storage policies, validated optional metadata and public projection; preserves friendly duplicate errors and omitted pictures. Shared avatar supports safe URL/error fallback across team views. Setup prepares/resizes uploads, previews/removes and prevents conversion/upload races; shared image preparation retains the old game helper export.
- **Checks:** Production build passed (430.54 kB); app/spec TypeScript and 986-key translation check passed; all four EN/AR picture upload/removal/anonymous/fallback browser cases passed. Default Angular fork workers timed out before running tests; established single-thread runner passed all 8 focused image tests. New pgTAP suite includes real workbook UPSERT; database execution awaits cloud CI.
- **Concurrent workspace change:** Five correctly named MP3 files appeared in public/sounds and .gitkeep was removed outside this implementation. Preserved and excluded from the team-picture commit; use these assets in the audio slice.
- **Cloud follow-up:** PR #26 frontend passed on 87a3a96; pgTAP found the added workbook fixture omitted required event scoring/currency fields. Corrected the fixture in 081a5a8 (pushed to PR #26 without rewriting history); cloud run 38712033268 passed both frontend and database, including all 957 pgTAP assertions. No merge performed.
- **Next:** Finish checks, inspect and publish stacked PR. Public opening attachment, reusable palette and consent-based audio remain subsequent slices. Old immutable picture objects are retained conservatively; cleanup must not delete a file during queued metadata replay.

## 2026-10-15 — Half-heart scoring and SVG hearts implementation — HANDOFF

- **Requested by:** Gendy; start implementing MEDIA_AUDIO_PLAN.md. First delivery slice: exact LIVES draw -0.5, server totals/breakdowns/import, SVG heart row and breaking animation, setup/workbook rule, fractional count-up and HEX round-trip repair. Subsequent media/audio slices remain pending.
- **Preflight:** Clean planning branch at 335c846; fetched origin, master still a774e36. Work on codex/half-heart-scoring, stacked on planning PR #24 without merging it.
- **Scope:** New migration after 0023, database regression coverage, shared SVG UI, setup/import/standings/life overlay and EN/AR strings. Preserve POINTS integer scoring, whole starting hearts/adjustments and signed totals.
- **Milestone:** Added migration 0024 for fixed -0.5 DRAW, exact numeric standings/breakdown/tiebreak, legacy input normalisation and historical tie invalidation. Added shared red full/half/depleted SVG artwork and a virtualised non-wrapping row, half-loss overlay, Setup fixed draw rule, template v6/old-version warnings, exact count-up/export coverage and labelled HEX input.
- **Review correction:** Current colorName() already preserves custom HEX; the earlier planning suspicion was incorrect. Corrected MEDIA_AUDIO_PLAN.md and added round-trip regression coverage instead of changing that behaviour.
- **Checks so far:** App/spec TypeScript, 982 translation keys and production build pass (429.67 kB initial). Direct Vitest lacked Angular JIT setup; Angular default fork workers timed out before tests. Retrying the official Angular runner with one thread worker. Browser/DB verification pending; local PostgreSQL/Supabase CLI are unavailable.
- **Verification milestone:** 32 focused pure unit tests pass with Angular compiler setup. Official Angular-runner tests passed 31/32 with one cold XLSX test timing out; moved its execution after the existing 30-second workbook warm-up without changing assertion budgets. Large-row browser checks found and fixed native fieldset minimum-width overflow. Versioned overlay history prevents recalculated historical draws from animating. Final sequential production build and all eight EN/AR browser journeys pass; both screenshots inspected. 32 focused unit tests pass after the final import guard. App/spec TypeScript, translations, formatting and whitespace pass. Bundle 429.71 kB; full frontend/database acceptance awaits cloud CI.
- **Publication:** Implementation commit 9b71aaa pushed; PR #25 opened/attached, stacked on #24. First CI 38665520482 passed 212/213 unit tests; one legacy emoji-currency assertion needs the D057 label update. Database startup applies migrations and fails at 0024: PostgreSQL rejects changing points_draw while phase6_points_invalidate references that column. The earlier pre-migration inference was incorrect. Drop/recreate the identical scoring trigger around the type change; historical backfill still runs with invalidation enabled. A verified stale empty Git lock was removed after confirming no Git process; automatic review rejected optional template restoration, so all edited templates were preserved.
- **CI milestone:** Corrected legacy label assertion and scoring-trigger dependency in commits 72f925b / 5d623a2. Run 38665799519 passes all 213 unit tests, 90 browser tests, build, translations, Edge checks and Lighthouse, but the optional report upload fails because GitHub artifact storage quota is exhausted. Making only diagnostic upload best effort; all product checks remain strict. Repaired migration applies on real Supabase; 930 assertions run with no failed assertions, but the new regression section aborts at single-dollar SQL quoting before completing its TAP plan. Corrected the generated test delimiters; full runtime acceptance still pending.
- **Cloud acceptance:** Run 38666549889 on 76c18c5 passes frontend and database: 213 unit tests, 90 browser tests, all 938 SQL assertions across 16 files, real owner/Auth smoke and member/login integration, formatting/translations/build/Lighthouse. Diagnostic upload remains visibly best effort due quota; product checks are strict. No merge or hosted deployment performed.
- **Next:** Implement team photos on the next stacked branch. Team photos, opening attachments, reusable custom swatches and full consent/audio service remain subsequent slices.

## 2026-10-15 — Explicit sound opt-in and sounds folder — DONE

- **Requested by:** Gendy; ask viewers for sound permission first and add public/sounds/.gitkeep now.
- **Preflight:** Clean codex/media-sound-plan at 075f8bd; reviewed required coordination docs. Scope: placeholder folder and explicit opt-in requirement in the sound plan/decision; no playback implementation.
- **Changed:** Added empty public/sounds/.gitkeep; sound plan and D061 now require a dismissible Enable sound / Keep muted prompt, default-off playback, no unrelated-tap activation, and a later enable/mute control. This records the requested UX; no app prompt or audio service implemented yet.
- **Checks/publication:** Changed-document formatting and whitespace checks run before commit; no runtime tests needed for docs/empty placeholder. Publish this logical change to existing PR #24; merging remains separate. Next: supply the five named MP3 clips and implement the planned features.

## 2026-10-15 — Review latest changes and plan hearts, media, colours and sound — HANDOFF

- **Requested by:** Gendy; fetch/review new changes and documentation, then plan five extensions. Implementation is not requested in this session.
- **Preflight:** Clean `codex/owner-admin-touch-target` at `9e32743`; fetched origin. Planning branch `codex/media-sound-plan` starts from latest `origin/master` at `a774e36` (PR #23).
- **Scope:** Review changes since the prior checkout (189 changed files), current contracts and docs; update the requirements source and add a concrete media/audio implementation plan with acceptance checks. Preserve published history and unrelated implementation.
- **Review milestone:** Inventoried 189 changed files and reviewed relevant current contracts/new docs. This is a planning review, not a complete line-by-line security audit. Latest master includes signed hearts gains, single names, quick look, member profiles, late results and phone UX; existing check counts are historical evidence, not rerun here.
- **Confirmed clarification:** Every LIVES draw removes exactly 0.5 heart with animation and sound; opening attachments support images/PDFs. POINTS stays integer-configured. Half-heart scoring needs exact numeric SQL/projection/import/export changes, not just an icon replacement.
- **Changed:** Added MEDIA_AUDIO_PLAN.md with five extension designs, file/bucket/contracts, delivery order and checks; plan §22 and D057–D061 record requirements. Corrected stale close/late-result rules and team-photo exclusion; added status/amendment pointers to audit and UX docs and pending rehearsal instructions to the runbook. Found custom HEX export fallback that loses unknown colours; included repair in plan. Duplicate legacy D029–D031 references remain a separately documented reconciliation issue.
- **Checks/publication:** Changed-document Prettier and git diff --check passed; IMPLEMENTATION_PLAN.md is excluded by the existing Prettier configuration; no app/database/device tests run because no runtime code changed. Audio assets and feature implementation are not delivered. Standing authorization covers publishing this documentation PR; merge is not authorized.
- **Published:** Planning commit 8a049cf pushed on codex/media-sound-plan; PR #24 opened and attached. GitHub connector returned 404; creation succeeded through GitHub REST using the existing Git credential in memory, without recording secrets. Cloud CI run 38660481429 is in progress. Vercel reports Deployment was blocked; its underlying reason is not established by that status alone.
- **Next:** Verify cloud checks and resolve/report deployment access; review the planning PR (no merge authorized), then implement exact half-heart contracts/icons first, followed by media, colours and audio. Clips needed: round-start.mp3, round-end.mp3, match-win.mp3, match-loss.mp3, match-draw.mp3 under public/sounds/.

## 2026-10-13 — UX round 3: hearts gains, single names, quick look, phone rows — DONE

- **Branch:** `codex/ux-round3`.
- **Database:** migrations `0021_hearts_gains.sql` (D053), `0022_single_names.sql` (D054), `0023_staff_directory.sql` (D055); pgTAP `0014_hearts_gains`, `0015_staff_directory`, updated `0011`/`0012`. Local Postgres 16 + pgTAP: all pass except the three stub-only storage checks in `0003`.
- **App:** hearts gains with presets in Setup and the workbook (v5); one name field per item in Setup, Owner and My details; quick-look sheet on team and game names (schedule, home, match and break cards); English terms in the Arabic UI and "vs"; staff without a team never see team selection; compact two-line table rows on phones (D056).
- **Checks:** i18n, unit tests, build, browser suite.

## 2026-10-13 — Self-service member details (D052) — DONE

- **Branch:** `codex/ux-round2`.
- **Database:** migration `0020_own_profile.sql` (`update_own_profile`, `normalize_member_phone`); pgTAP `0013_own_profile.test.sql` (14 assertions). Full local suite run on Postgres 16 + pgTAP: all suites pass except three storage-policy checks in `0003` that need Supabase's real storage schema (CI covers them).
- **App:** "My details" page and account-menu entry; readable audit label for the new action; Arabic and English errors for invalid or duplicate username/mobile and offline saves.
- **Checks:** i18n, unit tests, build, browser suite including `profile.spec.ts`.

## 2026-10-13 — UX round 2: result sheet, phone navigation, members, last result — DONE

- **Branch:** `codex/ux-round2` (stacked on `codex/ux-walkthrough-fixes`).
- **Result entry (D051):** "Who won?" with three radio tiles (avatar A · Draw · avatar B) inside a sheet on the referee station, late table rows included; details link keeps `/ref/match/:id`.
- **Manage on phones:** section bar and Import/Export toolbar hidden below 768 px (bottom bar and More cover them).
- **Members:** list first; "Add member" and edit open a sheet; one ⋯ per row opens Edit / Change password / Deactivate; All / Active / Inactive filter with counts.
- **Player:** home shows "Last result" for the latest finished round; choose-team text says switching is possible until the first round starts.
- **Refresh:** round teal icon buttons on Home, Schedule, My station, Control and Results.
- **Found on production after #20:** live refreshes blanked Home's current match and the schedule for a moment (data now stays until fresh data arrives); every page with its own `<header>` aborted route transitions (duplicate `view-transition-name`, now only on the shell header); deferred sheets render immediately when opened (`@defer (on immediate)`), with a browser test that reopens the menu after × and Escape.
- **Checks:** i18n, 207 unit tests, build, 84 browser tests.

## 2026-10-13 — Production walkthrough fixes (visitor, admin, referee) — HANDOFF

- **Branch:** `codex/ux-walkthrough-fixes` (from master after PR #19).
- **Visitor:** table rows slide in without starting transparent (rows stayed invisible when the browser paused animations); team page uses the schedule's scheduled/live/waiting wording; home shows each guide as a call link when phones are shown; CI timer test scoped to the round banner.
- **Admin:** a draft round adds nothing to "waiting for results"; late rows name their round; the tie banner waits until every round is closed; the duplicate round-status line is gone; started rounds cannot be deleted and other deletes need a second tap; the Excel import card hides once a round started; the audit log shows readable actions, record types and names with Latin digits; owner event status is translated.
- **Shared:** bottom sheets report every close, so a menu closed by the browser can reopen; `ds-phone-link` shows the name when there is no number.
- **Referee:** signed-in staff open `/schedule` without choosing a team (By round/By game); result buttons show team avatars and "X won"; finished matches of ended rounds stay as read-only history (D050, migration `0019`).
- **Checks:** i18n, 207 unit tests, build, 83 browser tests. pgTAP updated for D050; runs in CI.
- **Open:** guide walkthrough; result-entry layout (three tiles vs modal) awaiting the product owner.

## 2026-10-13 — UX enhancement U7 setup steps and U8 owner members — DONE

- **Branch:** `codex/ux-u7-setup` (stacked on U6).
- **Setup (U7):** steps Settings → Teams → Games → Rounds → Staff → Review with a done tick per step; the XLSX import card sits on the first step; scoring presets with an "Advanced" fold; the leaderboard switch lives only in its section (no duplicate checkbox).
- **Bulk add:** add N teams (next free codes, colour swatches and avatar grid), N games and N rounds in one sheet.
- **Schedule grid:** rounds × games grid; tap a cell to set or clear its pairing; break cells shown; repeated pairs flagged.
- **Review:** lists what is missing (name, teams, games, rounds, empty or incomplete rounds, a team twice in one round, games without referees, too many opening rounds) with a link to the step that fixes it; repeated pairings are flagged in the grid.
- **Owner (U8):** members are a searchable table (name with @username as row header, call link, status, actions); a new event's code defaults to `BTS-YYYY[-n]` and may be left blank.
- **Deviations:** the owner events list stays as cards (few rows, each with several actions). D-3 auto-fill of pairings was not built (undecided).
- **Checks:** i18n, unit tests, build, full browser suite including the new `setup.spec.ts`.

## 2026-10-13 — UX enhancement U6 player and guide screens — DONE

- **Branch:** `codex/ux-u6-public` (stacked on U5).
- **Home:** "Now" hero (current game, 📍 location large, opponent, outcome, "Next station" when done, resting notice), next-matches table and a top-5 standings preview.
- **Schedule (D039 kept):** Table/Cards switch stays; the table view is rebuilt on the shared table styles with break rows, own-team highlight and resting rows; visitors see only "My team" (D046).
- **Leaderboard:** `standings-list` gains a `table` variant (rank, team with tie/my-team/rank-change badges, W-D-L, total with count-up, forfeits/adjustments from 640 px), search above ten teams, a late-results note from `rounds[].late_count` (D041) and row drill-down limited by `ViewerScope`. Home preview and the venue display keep the list layout.
- **Team breakdown:** shared `app-team-breakdown` (summary, match-by-match table, adjustments, reconciliation) used by the drill-down sheet and the `/teams/:code` page.
- **Game details (members only):** one table per game with a row per round and break rows.
- **Guide chip:** signed-in guides see a "Guide" chip next to their team avatar (D044).
- **Shared:** `ds-data-table` columns may render as row headers; table styles are global; `ds-outcome` wraps its word in its own element.
- **Checks:** i18n (813 keys), 202 unit tests, build (initial 406.77 kB), full browser suite.
- **Next:** U7 setup checklist, U8 owner tables, then merge to `master` and production verification.

## 2026-10-13 — UX enhancement U5 referee "My station" — DONE

- **Branch:** `codex/ux-u5-referee` (stacked on P1).
- **Station (`/ref`):** header with the round timer ring; one hero card per match of the running round (game, 📍 location, teams, status pill incl. Queued, the teams' guides with one-tap call, Enter/Correct result); a searchable "Late results" table for ended rounds without a result (D041); the round × game schedule; event admins' phones (`get_event_contacts`). Pure helpers in `station-model.ts` (`stationGroups`, `nextActionable`, `guidesFor`).
- **Match entry (`/ref/match/:id`):** uses the shared `app-result-entry` (inline review); bonuses/penalties behind a "Match bonuses & penalties" button; a confirmed result returns to `/ref` with a toast "Result saved · Next: <game>" (or "All your results are in"); a queued result stays on the page until it syncs.
- **Hardening:** `ResultEntry.submit` now also refuses while the queue restores or a result is queued, ignores a reply for a match the component no longer shows, and cancels the review when permission is lost (old page-level safety tests ported to the component).
- **Shared:** `liveMatchStatus`/`sortForChase` moved to `live-helpers.ts`; `ToastService.show(key, params)` and the toast now translate their key (previously a raw key was shown).
- **Checks:** i18n, 202 unit tests, build (initial 403.39 kB), 80/80 browser tests incl. new station test (guides/admin phones, late table, axe, 360 px) in EN/AR.
- **Next:** U6 player/guide screens.

## 2026-10-13 — UX enhancement P1 visitor scope, phones, list search, logout clearing — DONE

- **Branch:** `codex/ux-p1-privacy` (stacked on U4).
- **Visitor scope (D046):** `core/player/viewer-scope.ts` — a visitor without a login sees only the selected team: Schedule shows only the "My team" tab, match/break cards and standings rows link only to the own team, `teams/:code` for another team and `games/:code` redirect home (`teamPageGuard`, `memberOnlyGuard`). Leaderboard and display stay visible only when published (D027, confirmed 2026-10-13).
- **Phones (D048):** staff phones (referees, admins) render only for signed-in members; visitors see only their team's DST guide.
- **Search (D049):** `ds-data-table` shows a search box above 10 rows (accent/Arabic-diacritic insensitive); new `ds-search-select` replaces long selects (owner members, adjustments team, adjustments filter).
- **Logout (D047):** `clearDeviceData` clears local/session storage (keeps `bts.lang`), caches and the offline IndexedDB; the account menu warns when unsent operations exist and reloads to `/home`.
- **Password redirect:** members created with temporary passwords (`must_change_password`, migration 0010) are sent to Change password by design; after saving they now return to the page they asked for (`returnUrl`) or their landing page.
- **Checks:** unit tests, lint, build, 78/78 browser tests incl. new `privacy.spec.ts` (EN/AR visitor scope, member view, logout clearing).
- **Next:** U5 referee "My station".

## 2026-10-13 — UX enhancement U4 admin Control, Results, Adjustments, export, drill-down — DONE

- **Branch:** `codex/ux-u4-admin` (stacked on U3).
- **Control (`live-page`):** round tabs with late badges, timer ring, status pill, count-up KPIs (results in x/y, waiting, late, bonuses & penalties), tie banner, a "matches waiting for a result" table with referee one-tap calls and inline result entry, and a fixed action bar: Start (now / X minutes ago with planned end and overtime warning), +5/+10/custom, End round (late-results notice), End & start next (two queued operations with a retry for the start), Reopen. Results cards and the event-adjustments panel moved out.
- **Results (`/manage/:id/results`):** `ds-data-table` per round sorted late → waiting → done → void; row or button opens the reusable `app-result-entry` in a sheet; ⋯ menu for reset/void; team names open the team breakdown.
- **Adjustments (`/manage/:id/adjustments`):** filterable table (type, team, revoked), revoke sheet, "Add" sheet reusing the adjustments panel with current → projected total.
- **Export (D045):** one-tap `app-export-sheet` (fresh snapshot → .xlsx download, phones excluded) from the toolbar, the More menu (`?export=1`) and Standings; "Preview first" keeps the frozen-preview flow (`?preview=1`).
- **Team breakdown sheet:** match-by-match outcome and points/lives from the server, adjustments table and a reconciliation footer; opened from Results, Adjustments and admin Standings.
- **Fix:** `StandingsReader` treats a non-array response as empty (an empty response previously broke rendering).
- **Checks:** 194 unit tests, i18n (792 keys), build (initial 401.51 kB), 73/73 browser tests incl. new `admin-control.spec.ts` (inline entry, End & start next 10 minutes ago, drill-down, export sheet, adjustments) in EN/AR.
- **Next:** privacy requirements from 2026-10-13 (anonymous scope, phones, logout clearing), then U5.

## 2026-10-13 — UX enhancement U3 round lifecycle, contacts and breakdown — DONE

- **Branch:** `codex/ux-u3-backend` (stacked on U2).
- **Migration `0018_ux_round_contacts_breakdown.sql`:** `close_round` ends a round with pending matches kept `SCHEDULED` as late results and returns `late_match_ids` (no automatic void/forfeit, D041); `start_round(p_op_id,p_round,p_started_minutes_ago)` backdates 0–180 min and refuses a start before the previous round's `closed_at` (D042; the 2-argument start still works and queued old operations replay unchanged); assigned referees may enter the first result of a late match, corrections in ended rounds stay admin-only; `get_referee_board` returns current/upcoming/late buckets with `editable` and the guides of teams at the station; `get_live_event` adds `game_referee_contacts` and `team_guides`; new `get_event_contacts` for event members; `get_bootstrap` rounds add `late_count`; `get_team_view` adds per-match `points`/`lives_delta` and a `breakdown` computed from `phase6_standings` in both scoring modes.
- **Deviation:** the late-results count is `rounds[].late_count` in `get_bootstrap` instead of a field on `get_standings`, so the standings array contract, export and display stay unchanged.
- **Client:** End round no longer blocked (late-results notice instead of `closeBlocked`); referee board hides upcoming matches until U5; home/life-lost overlay read lives from the server breakdown (`livesLeft`), client `teamLives` removed (R6); referees may open late matches; new error strings.
- **Tests:** new `0012_ux_round_contacts.test.sql` (62 assertions: offsets, replay, late first result vs correction, no auto void/forfeit, buckets, phone scoping, contacts permissions, POINTS and LIVES reconciliation incl. floor at zero, locks after a backdated start). Updated `0006` for the agreed rules. Full SQL suite (898 assertions) passed on a local Postgres 16 + pgTAP with Supabase stubs (no Docker on this machine); CI must still confirm on real Supabase. 185 unit tests, build (399.87 kB) and 69/69 browser tests pass.
- **Next:** U4 admin Control, Results, Adjustments, one-tap export and team drill-down.

## 2026-10-13 — UX enhancement U2 landing, navigation and Now sheet — DONE

- **Branch:** `codex/ux-u2-navigation` (stacked on U1).
- **Landing (§2.1):** `core/auth/landing.ts` — owners/admins → Control, referees → `/ref`, guides/players → home; used by `/` (`landingGuard`), the login redirect and the guest-only guard.
- **D044:** `TeamSelectionStore.guidedTeamCodes/canSwitch/canChoose`; a signed-in guide is moved to their single guided team even after the lock, and a guide of several teams switches only among them. Anonymous lock (D035) unchanged.
- **Navigation:** role-aware bottom nav (`layout/navigation.ts`, max five items); header 🔑/logout replaced by an initials button opening the account/More sheet (`layout/staff-menu`) with Import/Export, adjustments, audit, player view, display, members & events, language, password and logout.
- **D045:** `/manage/:eventId` renders `ManageLayout` once with the section bar (Control · Results · Bonuses & penalties · Standings · Setup · Audit) and permanent "Import (Excel)" / "Export (Excel)" buttons; per-page bars removed. Router uses `paramsInheritanceStrategy: 'always'`. `results`/`adjustments` temporarily open Control until U4. Export opens Standings with `?export=1`, which prepares the export immediately.
- **Now sheet:** the round banner opens a role-specific sheet (player match + location + next match, referee station status, admin results-in/pending/void count-ups with a pending table); staff also see a "Next: Round N" banner between rounds. Now sheet and menu are `@defer`-loaded.
- **Checks:** 184 unit tests, i18n (713 keys), build (initial 399.87 kB), Prettier pass. Browser suite 68/69; the only failure is the known flaky `lives.spec.ts` life-lost case. Updated `admin-layout` and `session-privacy` specs for the agreed nav; new `navigation.spec.ts` (landing per role, toolbar on every manage page, guide auto-select, Now sheet) in EN/AR.
- **Next:** U3 backend (migration 0018) and round lifecycle wiring.

## 2026-10-13 — UX enhancement U1 shared UI foundations — DONE

- **Branch:** `codex/ux-u1-foundations` (stacked on `codex/ux-u0-decisions`).
- **Added (`shared/ui`):** `ds-data-table` (+ `dsCell` templates, column priority with row expand, status accent, sort, skeleton/empty), `ds-tabs` (renders the D040 `.ds-tabs/.ds-tab` classes with a sliding RTL-safe indicator and arrow keys), `ds-status-pill`, `ds-outcome`, `ds-phone-link`, `ds-timer-ring`; moved `app-count-up` to `shared/ui/count-up.ts` (adds `duration`, `fromZero`). Bottom sheet gains `size="full"` and slide-up motion. Router uses `withViewTransitions()` with RTL-mirrored CSS; header/nav keep their own transition names. New `ui.*` EN/AR strings.
- **Checks:** 171 unit tests, i18n (667 keys), production build (initial 382.46 kB), Prettier on changed files pass. Browser suite 58/59 on the first full run; the failing `lives.spec.ts` life-lost case passed 18/18 on re-run (flaky under parallel load, not caused by this change). DB suite not run (no local Docker).
- **Next:** U2 landing, navigation, Import/Export placement and Now sheet.

## 2026-10-13 — UX enhancement U0 decisions — DONE

- **Requested by:** Peter; start the agreed UX plan v3.1 (`Claude outputs/`), Schedule Cards switch kept.
- **Preflight:** `master` @ `a827d45` (PR #18 Phase 8 merged), clean tree; branch `codex/ux-u0-decisions`.
- **Changed:** Updated both `Claude outputs/` files to v3.1; added D041–D045; plan §6.1 close/start rows, Phase 5 acceptance, §20 amendments note and new §21.
- **Checks:** Documentation only; `format:check` on changed Markdown.
- **Next:** U1 shared UI foundations on `codex/ux-u1-foundations`.

## 2026-10-12 — Phase 8: team lock, referees, breaks, lives scoring, schedule table — HANDOFF

- **Requested by:** Peter; approved slices 1–7 of the Phase 8 proposal. General inter-round breaks were cancelled; "no match for a game in a round = break" instead. Answers: first pick allowed after the lock; teams at zero lives stay at zero and keep playing; life emoji is free text with ten suggestions.
- **Preflight:** Clean `master` at `df28e10` (CRLF-only noise on the Windows checkout). Implemented in a Linux copy of the same commit; finished files copied back and committed on `feat/phase-8-extensions`, one commit per slice.
- **Implemented:** Slice 4 shared staff section bar/layout classes, 44 px remove-admin, masked localized owner password sheet (A07/A08, D040). Slice 1 team lock after the first round starts, staff exempt (D035). Slice 3 referee names on game details via migration `0016_game_referees.sql` (D036). Slice 2 derived per-game/team breaks on schedule, game details and setup builder, plus a referee round × game table on `/ref` (D037). Slice 5 LIVES scoring via migration `0017_lives_scoring.sql`: settings, lock after start, standings, tie invalidation, import workbook v4, export headings, lives meter and life-lost animation (D038). Slice 6 schedule Table (default) and Cards views (D039). Plan §20, README, FUTURE_PLANS (player market idea) and audit A07/A08 notes updated.
- **Checks passed:** 157/157 unit tests (31 files); translation audit 654 EN/AR keys; production build, initial 377.12 kB. Browser: 58/59 — new admin-layout, breaks, lives and team-lock journeys pass in EN/AR; XLSX import/export journeys pass under Node 24 (fail under Node 22 only from the known test-side ExcelJS import). SQL: all 15 existing migrations plus 0016/0017 apply and 837/837 pgTAP assertions pass (802 existing + 35 new) on a local Postgres 16 with a minimal Supabase stub (roles, `auth.uid`, `realtime.send`, storage tables). That stub is a local check, not Supabase CLI/CI evidence.
- **Not passed / environment:** `shell loads offline after service worker takes control` fails with Chromium's `in-incognito` installability error in the sandbox browser; it fails identically on untouched `df28e10`, so it is an environment issue. Cloud CI, hosted migrations and Lighthouse were not run.
- **Merge (2026-10-13):** Merged master `f3ae6f1` (PR #17 A07 fix) into this branch. Owner remove-admin keeps PR #17's non-shrinking 44 px target plus the member-specific label; PR #17's touch-target check matches the label as a prefix. Audit/progress histories from both branches retained.
- **Next:** Peter/Gendy review the branch, push `feat/phase-8-extensions`, open a PR and confirm cloud CI (expected 837 SQL assertions). Apply migrations 0016/0017 through the normal deploy workflow. Re-download the setup workbook after deploy (template v4).

## 2026-10-12 — Verify A06 merge and fix A07 touch target — DONE

- **Requested by:** Gendy; verify PR #16 merge/master and fix/publish A07. Standing authorization now covers pushing completed checked changes and opening PRs; merges require separate authorization.
- **Preflight:** Clean prior branch with one local evidence commit; fetched origin, PR #16 already merged at `df28e10`. Created `codex/owner-admin-touch-target` from master and carried evidence as `3a9f2c9`.
- **Master:** CI `38244996840` and Vercel production deployment pass at the merge commit.
- **Scope:** Enlarge owner remove-admin control to at least 44×44 px, verify EN/AR mobile layout; update collaboration instructions and publish PR.
- **Implemented/checked:** Remove-admin uses a centered non-shrinking 44×44 px minimum target; existing handler and accessible name retained. Focused production browser journey passes both languages at 360×740, asserting target dimensions and no horizontal overflow. Production build (373.91 kB initial), formatting and whitespace pass. Updated AGENTS.md with standing publication authorization.
- **Published/verified:** PR #17 at `352b2d9`; CI `38248413574` passes 146 unit tests, 43 browser tests and 802 SQL assertions. Frontend/database and Vercel preview/feedback checks pass.
- **Latest deployment blocker:** Documentation-only head `3db40fa` has a failed Vercel status after the application head deployed successfully. The inspector redirects to Vercel login; no local Vercel credentials are configured. Failure cause is unavailable through GitHub's reported status. Authenticated project access is needed to inspect deployment `CHaQxwJ5wKHDe852YWfZRV6ZfkZv`; do not infer an application regression from this status alone.
- **Handoff:** Final documentation evidence committed and published with this PR; no merge of #17 performed. Next: inspect/retry the failed Vercel preview using project access, review/merge #17 when checks are acceptable, verify master, then A08 localized masked password-reset form.

## 2026-10-12 — Publish A06 entity-language fix — DONE

- **Requested by:** Gendy; publish the finished fix and verify cloud CI.
- **Preflight:** Clean `codex/admin-entity-language` at `3c492b8`; fetched origin and reviewed branch commits/change summary; whitespace passes.
- **Scope:** Publish branch, open PR against master, verify/fix cloud checks. No merge requested in this session.
- **Published:** PR #16 (`codex/admin-entity-language`) at `22548f2`; opened through the signed-in browser because connector writes lack permission.
- **Cloud checks:** CI `38243675816` passes frontend and database on the published head: 146 unit tests, 43 browser tests, 802 SQL assertions across 11 files; formatting, 599-key translations, login/member handler checks and production build pass. Vercel preview and preview-feedback check pass.
- **Handoff:** PR #16 ready for review/merge; no merge performed. Final CI evidence committed locally. Next: merge and verify master, then A07 remove-admin minimum touch size.

## 2026-10-12 — Merge A05 and fix A06 entity language — HANDOFF

- **Requested by:** Gendy; merge PR #15, verify master and continue audit remediation.
- **Preflight:** Clean photo branch with one local evidence commit. PR #15 clean/mergeable, four checks green, no submitted review objections; merged via signed-in browser at `ac89603`. Fetched master, created `codex/admin-entity-language`, carried prior CI evidence via cherry-pick.
- **Scope:** Localize owner/setup display names, locations and selectors using the current language with opposite-language fallback; preserve explicit bilingual edit fields and payloads. Verify EN/AR and live switching. Master CI/deployment verification pending.
- **Master verification:** CI `38242121889` and Vercel deployment pass on `ac89603`. Supabase workflow intentionally does not trigger without changes under its configured paths; PR #15 changed no backend files.
- **Implemented:** Shared trimmed entity-label helper and current-language reads in setup/owner cards, selectors, round/game labels, locations, member/admin labels and staff team assignments. Removed duplicate secondary Arabic names; form field data remains bilingual.
- **Checks:** Seven focused unit tests pass (fallback plus owner and photo-selection regression). App/spec TypeScript, 599-key translations, production build (373.91 kB initial), formatting and whitespace pass. Browser journey reports passing runtime switching, Arabic labels and blank-translation fallback across setup/owner. Initial browser failures were ambiguous header/hidden option locators and fixture language reset on navigation; corrected and rerun passed. Windows runner cleanup remains slow after test completion. Full frontend suite and cloud A06 acceptance not claimed; no SQL changed.
- **Handoff:** Commit finished A06 locally on `codex/admin-entity-language`; not pushed. Next: publish A06 PR and verify CI, then A07 minimum touch size on remove-admin.

## 2026-10-12 — Publish A05 game-photo processing — DONE

- **Requested by:** Gendy; publish the finished fix and verify cloud CI.
- **Preflight:** Clean `codex/game-photo-processing` at `921bc1d`; fetched origin, inspected branch commits and change summary, whitespace check passes.
- **Scope:** Push the branch, open a PR against master and verify/fix frontend/database CI. Merge is a subsequent step.
- **Milestone:** PR #15 opened at `edd7e4c`; Vercel passes. First CI `38241086227` passes unit/build/format/translation/edge checks but one of 42 browser cases races the Save completion against the next invalid-image selection. Test now waits for form reset and enabled input after upload; product conversion assertions already passed.
- **Published/verified:** Correction `3cf4ce3` pushed without rewriting history. CI `38241429066` passes frontend and database: 144 unit tests, 42 browser cases, 599 translation keys, edge checks, formatting, build and Lighthouse; all 802 SQL assertions and real member/Auth/login integration pass. Container registry throttling delayed startup but recovered. Vercel is ready.
- **Handoff:** PR #15 ready for review/merge. Final evidence documentation committed locally, leaving the checked remote head at `3cf4ce3`. No merge performed. Next: merge PR #15, verify master CI/deployment, then continue remaining implementation-audit findings.

## 2026-10-12 — Merge A04 and implement A05 game photos — HANDOFF

- **Requested by:** Gendy; proceed with merge, master verification and next audit remediation.
- **Preflight:** Clean audit branch with one local evidence commit. PR #14 had four passing checks, clean merge status and no submitted reviews; merged via signed-in browser at `67a7cd8` after connector permission failure. Fetched master, created `codex/game-photo-processing`, carried evidence via cherry-pick.
- **Milestone:** Supabase deployment `38239432392` and master CI `38239432229` both pass on merged `67a7cd8`.
- **Scope:** Decode PNG/JPEG/WebP game photos, preserve proportions, resize longest edge to at most 1024 px, encode WebP before preview/upload; cover browser conversion and async selection races. No publication of A05 branch requested.
- **Implemented:** Browser conversion helper with decode/encoder validation, 20 MiB/40 MP source bounds and existing 5 MiB output limit; bilingual picker/progress/errors; conversion blocks Save; game switch/destroy invalidate pending selection and previews are released. D034 and A05 audit entry updated.
- **Checks:** Five focused unit tests pass (three conversion failures/resource cleanup, two pending selection/save/destruction cases). Both EN/AR browser journeys report passing real PNG/JPEG/WebP dimensions, upload-byte decoding and corrupt-image rejection; runner stalled after test completion during server teardown and was interrupted, with port 4300 confirmed closed. Initial async unit mock used unsupported Angular relative-module mocking; replaced with browser API mocks and rerun passed. App/spec TypeScript, 599-key translations, production build (373.91 kB initial), formatting and whitespace checks pass. Full frontend suite not run locally; no SQL changed.
- **Handoff:** Finished A05 implementation committed locally on `codex/game-photo-processing`; not pushed. Next: publish A05 PR and verify cloud CI before merge.

## 2026-10-12 — Publish A04 audit viewer and verify CI — DONE

- **Requested by:** Gendy; proceed with publication and cloud verification.
- **Preflight:** Clean `codex/admin-audit-viewer` at `43e9a80`; fetched origin and reviewed the full diff against master, with whitespace checks passing.
- **Scope:** Publish this branch, open its PR against master and verify/fix cloud frontend/database checks. No merge or production deployment requested.
- **Published:** Branch head `b7ee747` pushed and PR #14 opened. GitHub connector creation returned 403; signed-in browser creation succeeded.
- **Cloud checks:** CI `38238549788` passes both jobs. Fresh migrations/reset, real member/Auth and login lockout/concurrency integration pass; all 802 pgTAP assertions across 11 files pass, including the 27 audit-reader assertions. Full frontend unit/browser suites, edge tests, formatting, translations, build and Lighthouse pass. Vercel preview is ready.
- **Handoff:** A04 runtime acceptance verified; PR #14 is ready for review. No merge or production database deployment performed. Final evidence-only documentation commit stays local so the remotely checked head remains `b7ee747`. Next: review/merge PR #14, then A05 game-photo conversion/resize.

## 2026-10-12 — A04 administrator audit viewer — HANDOFF

- **Requested by:** Gendy; PR #13 is merged, continue with the next audit remediation.
- **Preflight:** Clean prior branch; fetched and verified PR #13 merged at `6eb89a4`. Master CI `38228132819` and Deploy Supabase `38228132808` pass. New `codex/admin-audit-viewer` starts from merged master and carries the prior local verification log via cherry-pick.
- **Scope:** Event-admin/owner-only paginated audit RPC, typed client, bilingual filterable viewer and navigation, permission/pagination and frontend/session regression coverage. No hosted member/password mutations for verification.
- **Milestone:** Implemented migration `0015`, typed online AuditApi and EN/AR audit route/navigation with server action/entity filters, precision-safe ID cursors, actor names, Cairo timestamps and safely escaped before/after details. Added 27 pgTAP assertions, seven audit unit cases and EN/AR mobile browser journeys; cross-tab logout coverage now includes the ninth privileged route.
- **Checks so far:** Seven audit unit tests pass; all 11 browser journeys pass (two EN/AR filter/pagination/escaping/axe/mobile checks plus nine cross-tab logout routes). App/spec TypeScript, 598-key translations and production build pass at 373.91 kB initial. Initial unit worker startup timed out before tests; serial retry passed. Initial browser label locator was corrected; final browser run passes. EN/AR screenshots inspected. Additional guard/session unit regression passes 16/16, for 23 focused unit passes total. No full frontend-suite pass claimed.
- **Database/hand-off:** Local `npm run test:db` reaches Postgres but fails ECONNREFUSED at 54322; all 27 new SQL assertions remain runtime-unverified (expected combined total 802). D033 records cursor/read semantics; audit report now separates PR #13 cloud acceptance from this new implementation. Commit locally on `codex/admin-audit-viewer`; nothing pushed or deployed. Next: publish a PR and verify cloud database CI before accepting A04, then A05 game-photo conversion/resize.

## 2026-10-12 — Publish and verify PR #13 database repairs — DONE

- **Requested by:** Gendy; edit and proceed, authorizing publication and CI follow-through.
- **Preflight:** Clean `codex/phase-7-readiness`; fetched origin and confirmed no remote-only commits. Reviewed fix diff and whitespace.
- **Published:** `be40a7a` is pushed to PR #13 without rewriting history.
- **Cloud verification:** Run `38227505696` on `be40a7a` passes database and frontend jobs. All 775 pgTAP assertions across ten files pass, as do fresh migrations/reset, real member/Auth integration and full login lockout/concurrent admission/completion integration. Vercel passes.
- **Handoff:** PR #13 repair is verified and ready for review; no merge or production deployment performed. This final evidence-only log update is committed locally, leaving the remotely checked PR head at `be40a7a`. Remaining implementation audit/Phase 7 requirements stay open.

## 2026-10-12 — Repair PR #13 database fixture failures — HANDOFF

- **Requested by:** Gendy; database check still fails after migration fix.
- **Preflight:** Clean `codex/phase-7-readiness` at `a305419`, now published by the user and matching PR #13 head. Run `38226245094` applies all migrations and passes real member/Auth/login integration; pgTAP reports 2 failures among 775 assertions.
- **Changed:** Foundations receipt count now filters its test operation; member audit-failure regression uses a third, unlinked Auth fixture. Production constraints, expected audit exception and rollback assertions remain intact.
- **Checks:** Changed-file Prettier, whitespace and diff review pass. Local database retry fails ECONNREFUSED at port 54322; repaired assertions require cloud execution. Previous cloud run passed 773/775 assertions and real member/login integration, not a fully passing suite.
- **Handoff:** Repair committed locally; no push/deployment. Next: publish this commit to PR #13 and verify its complete database job. Repository instructions require user authorization to push.

## 2026-10-12 — Repair PR #13 migration numbering — HANDOFF

- **Requested by:** Gendy; database check is still failing.
- **Preflight:** Clean `codex/phase-7-readiness` at `96f702f`, matching PR #13 head. Latest run `38225536749` confirms the same duplicate `0010` migration-version failure before database tests.
- **Changed:** Renamed the new login-lockout migration to `0013_login_lockout.sql` with SQL contents unchanged; updated current decision/audit references. Existing password-change migration `0010` and member-audit migration `0014` retain their versions.
- **Checks:** All 14 migration versions are unique; renamed SQL matches the original committed file exactly. Changed-document Prettier and whitespace checks pass. Database runtime retry reaches localhost but fails ECONNREFUSED at port 54322; no SQL runtime pass claimed.
- **Handoff:** Fix committed locally, not pushed under repository rules. Publish this commit to PR #13 to trigger fresh cloud database CI; current remote checks still run the unfixed migration list.

## 2026-10-12 — PR #13 CI diagnosis — DONE

- **Requested by:** Gendy; check what is wrong with the latest PR.
- **Preflight/scope:** Clean `codex/phase-7-readiness` at `24fe6b3`, matching PR #13 head; read-only PR/CI investigation plus this session record. Initial general search omitted #13; explicit open-PR search found it.
- **Confirmed blocker:** Run `38179650297`, database job `114589306710`, fails during `supabase start`: `schema_migrations_pkey` rejects duplicate version `0010`. The merged branch contains both `0010_login_lockout.sql` and `0010_password_change.sql`; Supabase identifies migrations by numeric prefix.
- **Checks/outcomes:** Frontend and Vercel pass. Database migrations stop before reset/Auth/pgTAP checks, so this run provides no SQL acceptance. Registry rate-limit warnings recovered and are not the terminal error.
- **Next:** Rename the new lockout migration to unused version `0013`, preserving existing password-change migration `0010` and member-audit migration `0014`; update references, then rerun cloud database CI. No product fix, push, deployment or CI rerun performed. Diagnosis record committed locally only.

## 2026-10-12 — Resolve members Edge merge conflict — HANDOFF

- **Branch:** `codex/phase-7-readiness`.
- **Changed:** Resolved and staged `supabase/functions/members/index.ts`, retaining audited member-admin writes and adding first-login password change through durable member operation RPCs. Extended the in-progress member-audit migration/test; mapped the bare client import in `supabase/functions/deno.json`. Updated D032, AuthStore/page handling, and EN/AR pending notices so uncertain outcomes clear the form and are not shown as success.
- **Checks passed:** `npm run test:edge` (56 mocked checks); focused AuthStore unit test (6 passed); `npm run build` (372.01 kB initial bundle); `npm run test:i18n` (582 matching keys); Prettier; `git diff --check`; TypeScript resolves `@supabase/supabase-js`; editor diagnostics report no errors in the Edge handler.
- **Blocked:** `npm run test:db` could not connect to local Postgres at `127.0.0.1:54322`; SQL behavior remains unverified at runtime. Deno CLI is unavailable, so no standalone `deno check` was run.
- **Handoff:** Conflict is resolved in the index; supporting migration/tests and docs remain in the shared worktree. No commit or push was made to avoid bundling this change with the other staged work. Next, run `npm run test:db` once local Supabase is available, then commit the coordinated changes.

## 2026-10-11 — A02 login lockout and A03 member audit reliability — HANDOFF

- **Requested by:** Gendy; proceed with the next two audit fixes, continuing with Astra.
- **Preflight:** Clean `codex/phase-7-readiness` at `e437171`; no publication or deployment requested.
- **Scope/owners:** Primary owns A02 login handler, migration `0010`, lockout tests and shared documentation/CI integration. Astra owns A03 member handler, migration `0011` and member audit tests. Separate logical commits; preserve all shared work.
- **Acceptance:** Full ten-minute lockout after the fifth failure, including concurrent attempts and failed persistence; member actions must have a reliable audit boundary. No secrets in audit payloads. Run local handler regressions and available SQL checks; local Docker remains unavailable, so cloud database execution may remain pending.
- **2026-10-12 resume:** Previous session stopped on a usage-limit interruption, including automatic approval review. Saved work is intact. Resumed with Astra on A03. Local database retry now executes but cannot connect to `127.0.0.1:54322`; SQL and real Auth/database concurrency acceptance remain pending. A02 mocked handler checks pass 22/22.
- **A02 implementation milestone:** Persisted deadline/admission RPCs in `0010`, 24 pgTAP assertions and a localhost handler/Auth integration extension cover full duration, expired reservations, atomic recording and concurrent admission/completion. Handler checks pass 22/22; new `test:edge` CI step runs them. SQL/real Auth execution remains pending; no hosted changes or publication.
- **A03 implementation milestone:** Astra delivered atomic member/audit writes, payload-bound receipts, durable external Auth intents/completion and explicit owner review notices. Added 29 passing mocked handler checks, 27 pgTAP assertions and localhost real Auth/member integration. D032/runbook describe pending-operation reconciliation. A02 committed locally as `71929b6`; A03 frontend validation is in progress. No push or deployment.
- **Final checks (2026-10-12):** Both actual-handler suites pass 51/51 with simulated transport. Three owner Angular unit tests pass after correcting the Supabase getter mock; ten browser journeys pass (new EN/AR pending notices plus all eight privileged logout routes). Production build passes at 370.84 kB; app/spec TypeScript, 558-key translation audit, changed-file Prettier, script syntax and whitespace pass. Test-owned preview server stopped. No full frontend-suite rerun claimed for this focused change.
- **Handoff:** A02 and A03 implementations are committed locally as separate fixes; nothing pushed or deployed. Added 51 SQL assertions (expected suite total 755) and real localhost Auth/member/concurrent-login checks are prepared for CI, but not runtime-verified because local database port 54322 refuses connections. Publish when requested and verify both CI jobs before accepting these database changes. Next feature gap is A04, the administrator audit viewer; other audit/Phase 7 requirements remain open.

## 2026-10-11 — A01 privileged screen session isolation — DONE

- **Requested by:** Gendy; proceed with audit remediation, beginning with the cross-tab logout privacy finding.
- **Preflight:** Clean `codex/phase-7-readiness` at `31a8a00`; no push/deployment requested.
- **Scope:** Shared routed-screen lifecycle boundary for owner, manage and referee areas; destroy previous actor/permission-context views, including forms and late read responses. Add normal-CI regression coverage and update audit evidence.
- **Validation plan:** Focused lifecycle unit tests, real two-tab browser logout coverage, TypeScript/build, translations and changed-file formatting. Database permissions remain unchanged; local Docker remains unavailable.
- **Milestone:** Shared session outlet integrated; all nine lifecycle unit tests and eight real cross-tab logout tests pass. Every owner/manage/referee route is covered in normal CI; token refresh preserves drafts, account changes discard them, and revoked access destroys the view. Build passes at 370.84 kB; app/spec TypeScript and 555-key translations pass. Final focused run passes 15/15 unit tests (nine lifecycle and six guard tests); full Node 24 browser regression passes 35/35, including all 27 existing cases and eight new logout cases.

- **Final review/handoff:** Astra reviewed the shared lifecycle boundary and regressions. Changed-file Prettier and whitespace checks pass; no SQL changes or database rerun (local Docker unavailable). A01 is complete and committed locally on `codex/phase-7-readiness`, without pushing. Other audit findings remain open. Next: A02, enforce the full ten-minute lockout after the fifth failure, then A03, handle failed audit writes.

## 2026-10-11 — Full requirements and application audit — DONE

- **Requested by:** Gendy; review all plans/docs and test the application against them.
- **Preflight:** Clean `codex/phase-7-readiness` at `72a4436`; preserve the local Phase 7 slice. No publication or deployment requested.
- **Scope:** Read repository requirements/decisions/runbook/history; map implemented behavior and tests to the plan; execute frontend/unit/browser/accessibility/build/translation/format and available database checks. Add focused audit regressions for uncovered requirements when useful, without implementing unrelated features.
- **Evidence rule:** Separate fresh passes, existing cloud evidence, confirmed gaps, and blocked hosted/device checks. Record findings in a committed audit report and update this entry before handoff.
- **Milestone:** Build, TypeScript and 555-key translation check pass. Initial Node 22 run: 115/116 unit tests (ExcelJS cold-start timeout; focused retry passes 4/4), 25/27 browser tests (Node-side workbook import failure). Node 24 browser rerun passes all 27 tests after test-owned server teardown; full unit rerun still times out one export case. Database rerun reaches localhost but fails ECONNREFUSED at 54322; repo-wide formatting flags 31 existing files.
- **Confirmed contract findings:** Offline handler probes execute actual Edge source with simulated transport/clock: 10/12 pass. Lockout expires early after five spread-out failures; member writes return success even when audit insertion fails. Static review also finds missing audit-log RPC/UI, absent game resize/conversion, untyped setup RPCs and remaining documented Phase 7 features. No product changes made.
- **Final audit evidence:** Opt-in committed browser diagnostics reproduce four failures: owner member phone remains visible after real cross-tab logout (P1), 8.91×24 px owner remove-admin control, English team names in Arabic setup, PNG upload rejection. Both 390×844 EN/AR reduced-motion/axe probes pass. Handler diagnostics remain 10/12 passing. Lighthouse a11y 100 / best practices 96 / performance 68. Explicit local 3G/4×CPU diagnostic measures 8.120 s EN and 7.606 s AR on uncompressed assets; hosted/physical-device timing remains unverified. Fresh npm audit confirms two documented moderate ExcelJS/uuid entries, zero high/critical.
- **Database evidence:** Re-read GitHub run `38139075290`: both jobs succeeded; DB log confirms 704 assertions across seven suites. Current SQL matches verified `4bad347`; this is prior cloud evidence, not a fresh local/hosted run. Missing direct delete-RPC test coverage and absent Edge login integration are documented.
- **Handoff:** Full traceability/findings are in `docs/IMPLEMENTATION_AUDIT.md`; reproducible opt-in failing browser/Edge/performance diagnostics are committed separately from normal CI. Product code and acceptance criteria unchanged. Audit files pass changed-file formatting/whitespace and diagnostic parse checks; confirmed failures remain intentionally red. Commit locally on `codex/phase-7-readiness`, no push. Next: fix A01 privileged component state on actor changes, then lockout/audit failures, missing requirements and coverage before release.

## 2026-10-11 — Phase 7 readiness kickoff — HANDOFF

- **Requested by:** Gendy; start the next phase.
- **Preflight:** Clean working tree; fetched origin and verified Phase 6 PR #9 merged at `50e6066`. New branch `codex/phase-7-readiness` starts from refreshed master.
- **Scope:** First readiness slice: bilingual PWA install affordance/manual guidance, strict initial bundle budget, event-day runbook. Subsequent Phase 7 work includes celebrations, printable team QR sheets, motion review and measured 3G first-load acceptance.
- **Delivered:** Browser install lifecycle retained by the shell, gesture-triggered About install card with EN/AR manual instructions, strict 500 kB build error budget, event-day runbook and D029. No domain/permission changes.
- **Checks passed:** Production build (369.49 kB initial), app/spec TypeScript, translation audit (555 matching paths), changed-file Prettier and whitespace. Two install lifecycle unit tests pass using existing ignored serial thread configuration; default forks timed out before executing tests. Two production EN/AR browser journeys pass with mocked install events/RPCs, axe and 360 px overflow checks; Arabic screenshot inspected. Browser teardown required stopping only its test-owned preview server. No claim of native device install or 3G timing verification.
- **Handoff/next:** First slice committed locally on `codex/phase-7-readiness`; no push, merge or deployment. Implement once-per-event/team result celebrations and printable admin team QR sheets next, then complete motion, real-device install/offline and 3G performance checks. Phase 7 and Phase 0 hosted acceptance remain pending. Database tests were not rerun because this slice changes no SQL and local Docker is unavailable.

## 2026-10-11 — Usernames in exported setup and multiple guides — HANDOFF

- **Requested by:** Peter: the exported setup showed no English usernames; several guides must be allowed on one team. `nesro` confirmed as نسرين نبيل, so no extra account is needed.
- **Cause and fix (usernames):** ExcelJS writes formulas without cached values and no recalculation flag, so Excel/phone viewers left formula cells (staff usernames, game headers) blank. The workbook now sets `fullCalcOnLoad` and writes cached results for staff usernames and schedule game headers.
- **Multiple guides:** Migration `0011` drops `one_guide_per_team`, returns `guides` (all) alongside `guide` (first) in public team JSON and strips both from standings. Client validator and workbook no longer flag a second guide; team pages list every guide. pgTAP expectations in suites `0003`/`0004` changed from rejection to acceptance (D031).
- **Checks:** 117 unit tests (22 files), TypeScript and i18n audit pass; pgTAP not run locally (no Docker) — confirm in CI.
- **Next:** Push to `feat/import-template-v3`, open the PR, confirm CI, merge.

## 2026-10-11 — Arabic setup template v3 and temporary passwords — HANDOFF

- **Requested by:** Peter: Arabic-first RTL, colourful setup workbook exported with live data; up to 20 pre-coloured teams the admin removes; a round × game schedule grid where an empty pair is a game break; one name per event/team/game/location/round/member; DST members created with username-based temporary passwords and a later password change.
- **Template v3 (`import-workbook.ts`, `template-catalog.ts`):** Sheets ابدأ هنا (live readiness tiles), الحدث (opening game/duration moved here), الفرق (20 defaults, palette/avatar dropdowns, live match/rest counts), الألعاب, الجدول (grid → rounds + matches; red conflicts, grey breaks, team-colour cells), الطاقم (member by name, one referee row per game), الأعضاء/الألوان والشعارات (read-only), `_meta` (very hidden, `template_version` 3). Download now exports the current setup (`get_event_setup`, incl. `eligible_members`) and re-imports by code. Parser emits the unchanged server payload (single name → both `name_en`/`name_ar`; referee rows grouped to comma `game_codes`), so `import_event_setup` is unchanged. Old templates are rejected with `OLD_TEMPLATE`.
- **Passwords:** Migration `0010` adds `members.must_change_password`, exposes it in `get_my_profile` and flags non-owner logins created from 2026-10-11 19:30 UTC. `members` Edge Function: owner create/set_password set the flag; new `change_own_password` for any active member (≥12 chars, must not contain the username) clears it. `authGuard` sends flagged members to `/account/password`; header has a 🔑 change-password link.
- **Members created (hosted, via the owner page):** 109 DST members from Peter's list (excluding Peter and Gendy, who exist) with Arabic names, no phones, temporary passwords following the agreed username-based rule (value not recorded here). `نسرين نبيل` was not created pending confirmation that she is the existing `nesro` account.
- **Checks:** 116 unit tests (22 files), i18n audit (567 keys), changed-file Prettier and production build (369.35 kB initial) pass. Import EN/AR browser journeys pass locally with axe; the offline service-worker shell journey fails locally on installability with the container's older Chromium (unrelated files untouched) — confirm in CI. pgTAP suite `0008` written, not run locally (no Docker).
- **Next:** Publish the branch, confirm CI (DB + browser), merge so migration `0010` and the Edge Function deploy; until then the new accounts are not forced to change their temporary password.

## 2026-10-11 — Phase 6 cloud acceptance — DONE

- **Requested by:** Gendy; finish Phase 6, fix Arabic translation keys, apply a contrasting gold header, and publish its checked PR.
- **Verified code:** `4bad347` on `codex/phase-6-standings`; [PR #9](https://github.com/peter-elmasry/BTSApp/pull/9). Both jobs pass in [CI run 38139075290](https://github.com/peter-elmasry/BTSApp/actions/runs/38139075290).
- **Database passed:** Fresh Supabase startup/reset applies migration `0009`; owner seed/auth smoke and all 704 pgTAP assertions across seven suites pass, including 153 new standings/visibility/tie/export assertions. No local Docker installation or hosted database change was needed.
- **Frontend passed:** Standard CI passes 114 unit tests across 22 files, all 25 browser journeys, 547-path translation audit, formatting and build (368.50 kB initial). Lighthouse accessibility 100, best practices 96, performance 71. Local EN/AR mobile and landscape screenshots were inspected; TypeScript and source-integrity checks passed.
- **Repairs:** Privacy assertion now matches actual private JSON keys instead of the safe `show_guide_phone` flag; Arabic setup regression waits for translated options to render. Standings entrance motion keeps full text contrast. No assertions were removed and CI timeouts remain unchanged.
- **Handoff:** Phase 6 is ready for review in PR #9, including gold/navy shared header and missing choose/delete/remove labels. Publish this final verification record and confirm its head checks; do not merge or deploy without a further request. Phase 7 polish/readiness and Phase 0 hosted acceptance remain separate.

## 2026-10-10 — Phase 6 standings, visibility, export and display — HANDOFF

- **Requested by:** Gendy; implement the next phase, continuing the established divide-and-conquer, DRY and KISS direction.
- **Preflight:** Clean Phase 5 branch; PR #8 merged at `6d8d7c9`, with final head `c7045e3` cloud checks green. Fetched origin; new `codex/phase-6-standings` starts from refreshed master.
- **Scope/owners:** Database agent owns computed standings, tie/visibility/export RPCs and pgTAP; public UI agent owns leaderboard/display and animation; admin/export agent owns tie/visibility/export screens and workbook generation/tests. Primary owns shared contracts/API/read state, guards/routes/shell/home/team integration, browser checks, decisions, validation and commit.
- **Contract:** `get_standings(p_event)` returns typed rows; hidden standings are restricted to owners/event admins per D005. `set_tiebreak(p_op_id,p_event,p_team_ids)` orders a complete tied group; `set_leaderboard_visibility(p_op_id,p_event,p_public)` changes only visibility. `get_export_data(p_event)` returns one current admin-only snapshot with standings/matches/adjustments/staff and generated timestamp. Domain changes invalidate manual tie resolutions. Every mutation remains actor-bound, queued and audited.
- **Acceptance/next:** Current points recalculate totals, unresolved ties share rank, manual order is valid/current, export matches the displayed snapshot, hidden data is removed on visibility/auth changes, mobile EN/AR and display auto-cycle work with realtime/polling. Local Docker remains unavailable; do not install it. Implement/test/commit locally; new-phase publication, merge and hosted deployment are separate.
- **Implementation milestone:** Migration `0009` and 153 expected new pgTAP assertions are written (704 expected total, runtime pending). Shared contracts/cache reader, public routes/navigation/home/team ranks, motion/display, admin tie/visibility and four-sheet export are integrated. Independent review checked SQL permission/snapshot paths and client actor/visibility gates; cached schedule timestamps now redact alongside outcomes. D026/D027 record tie invalidation and export boundaries. First production build passes at 368.76 kB initial; full unit/browser checks and final rebuild remain in progress.
- **Validation/resume milestone:** Build passes at 368.66 kB; all 22 browser checks pass after shared home/leaderboard count-up and navigation markup repair. Lighthouse accessibility 100, best practices 96, performance 42 on the constrained local laptop. TypeScript and changed-file formatting pass. Unit workers timed out before tests; probe measured jsdom import near 57 seconds, so a temporary ignored startup-only budget is being used without changing assertions/test timeouts. LIVE scoring warning and shared setup currency preview are added; final checks pending. Gendy requested continuation after reset, an Arabic translation-key audit (observed `common.remove`), and a gold header with contrasting logo/text/controls; primary owns these changes before final validation/commit.
- **2026-10-11 user follow-up:** Translation audit found `common.remove`, `common.delete` and `common.choose` absent in both catalogs; added matching EN/AR labels and a CI `test:i18n` check for catalog parity/literal references (547 matching paths). Shared header uses existing gold/navy tokens and navy logo, dark text, navy auth buttons and dark language-button border. Recovered full unit pass: 114/114; final header/unit/browser validation remains in progress. No publication or deployment performed.
- **Recovery milestone:** Local session interruption left four recent files filled with null bytes. Recovered setup browser fixtures/tests exactly from Playwright source maps; restored the plan/decisions from Git and reapplied Phase 6 decisions plus the requested header update. Application/SQL files were intact. Final unit checks pass all 114 tests across runs with unchanged assertion timeouts; moving ICU/ExcelJS cold-start timeouts are documented in ignored logs. The final 24-test browser run was interrupted after existing player journey timeouts; restart verification before committing.
- **Publication authorized:** Gendy explicitly requested finishing Phase 6 and making its PR after checks. Corrected a contrast failure during the standings opacity animation by retaining movement without fading text; isolated LIVE/DRAFT warning fixtures to avoid testing an illegal lifecycle reversal through stale cached setup. Run the final 25 browser journeys and production/format/i18n/accessibility checks, then commit, push/open the PR and verify/fix cloud CI (704 expected database assertions). No merge or hosted deployment authorized.
- **Final local validation:** Production build passes (368.50 kB initial); all 25 Chromium journeys pass in one run, including actual XLSX parity/downloads, EN/AR mobile axe, Arabic setup labels, LIVE/DRAFT currency/warning checks, privacy and landscape display. All 114 unit tests pass across final runs as detailed above; app/spec TypeScript passed. Translation audit (547 matching paths), changed-file Prettier, whitespace and null-byte integrity checks pass. Lighthouse accessibility 100, best practices 96, performance 67; gold-header and landscape screenshots inspected. Stopped only the test-owned preview server to release Windows teardown after all assertions passed. Local overrides/logs stay ignored.
- **Handoff/next:** Commit and publish `codex/phase-6-standings`, open/attach its PR, then verify/fix standard cloud frontend/database CI. Database migration and 704 expected pgTAP assertions remain unrun locally because Docker is unavailable; Phase 6 acceptance remains pending cloud results. No merge or hosted deployment performed.
- **Publication milestone:** Committed/pushed `b9b892d` and opened/attached [PR #9](https://github.com/peter-elmasry/BTSApp/pull/9). The GitHub connector lacked PR-write permission (403); existing local Git authentication created the requested PR without exposing credentials. [CI run 38138391803](https://github.com/peter-elmasry/BTSApp/actions/runs/38138391803) is running; both job results remain pending.
- **Cloud repair:** Frontend passes standard CI (114 unit tests, 25 browser checks, translation/format/build and Lighthouse accessibility 100). Database reset/auth smoke pass; 703/704 pgTAP assertions pass. Export privacy assertion 62 matches the harmless `show_guide_phone` boolean because its regex searches any occurrence of `phone`. The export uses explicit fields and removes nested guide phones. Tighten the assertion to actual JSON property names while retaining the seeded phone-value exclusion; rerun cloud CI without changing export permissions or payload.
- **Browser race repair:** Run `38138762709` exposed an immediate `.count()` check before the rounds tab finished rendering in the new Arabic-label journey (24/25 passed; unit/build/format/i18n passed). Replace it with an auto-waiting locator text assertion; no timeout or product behavior changes. Commit/push the focused test repair and recheck both jobs.
- **Database verified:** [Run 38138762709](https://github.com/peter-elmasry/BTSApp/actions/runs/38138762709) on `0386232` passes fresh Supabase startup/reset, owner seed/auth smoke and all 704 pgTAP assertions across seven suites, including 153 new Phase 6 assertions. The focused Arabic-label browser repair passes locally; final combined cloud CI remains pending.

## 2026-10-10 — Publish Phase 5 and verify cloud CI — DONE

- **Requested by:** Gendy authorized opening the Phase 5 PR after the publication/CI request.
- **Preflight:** Clean `codex/phase-5-live-operations` at `79faecf`; refreshed origin, master remains `90c7791`. Reviewed the 54-file feature/database/test/documentation diff and whitespace; no history rewriting.
- **Scope/next:** Push branch, create/attach PR against master, run/fix cloud checks. Local evidence: 86 unit tests, all 16 browser checks across runs, build (364.10 kB), TypeScript, formatting, whitespace and Lighthouse accessibility 100 pass. Database runtime remains pending with 551 expected assertions. No merge or hosted deployment authorized.
- **Publication milestone:** Published `42ae9cb` and opened/attached [PR #8](https://github.com/peter-elmasry/BTSApp/pull/8). Connector PR creation returned 403; existing local Git authentication created it without exposing credentials. [CI run 38076718415](https://github.com/peter-elmasry/BTSApp/actions/runs/38076718415) is queued; both job results remain pending.
- **Cloud milestone:** Frontend job `114285122162` passes formatting, unit tests, production build, browser checks and Lighthouse using standard CI settings. Supabase startup succeeds; database reset/migration and pgTAP results remain pending.
- **Validation passed:** [CI run 38076718415](https://github.com/peter-elmasry/BTSApp/actions/runs/38076718415) on `42ae9cb` passes both jobs. Fresh Supabase startup/reset applies `0008_phase5_live.sql`; all 551 pgTAP assertions across six suites pass, including 154 new live-operation assertions, plus owner seed/auth smoke checks. Frontend passes 86 unit tests, all 16 browser checks in one standard CI run, formatting, build (364.10 kB initial) and Lighthouse (accessibility 100, best practices 96, performance 70). No cloud repair was needed.
- **Handoff:** Phase 5 is implemented and verified, ready for review in [PR #8](https://github.com/peter-elmasry/BTSApp/pull/8). Publish this final verification record and confirm its head checks. No merge or hosted deployment performed. Phase 6 follows review/merge; Phase 0 hosted acceptance remains separate.

## 2026-10-10 — Phase 5 live operations — HANDOFF

- **Requested by:** Gendy; continue the next phase, retaining the earlier divide-and-conquer, DRY and KISS direction.
- **Preflight:** Clean Phase 4 branch; fetched origin and verified PR #7 merged at `90c7791`. Both jobs pass on final Phase 4 head `cbf7a23` (397 database assertions, 46 unit tests, nine browser checks). New `codex/phase-5-live-operations` starts from refreshed master.
- **Scope/owners:** Database agent owns lifecycle/result/adjustment RPCs and pgTAP; infrastructure agent owns IndexedDB read cache/op queue, realtime and polling; UI agent owns referee/admin live screens and translations. Primary owns typed shared contracts, integration/routes/shell, browser checks, decisions, validation and commit.
- **Contract:** Live staff reads return explicit `LiveSnapshot` fields through `get_live_event(p_event)` (admin), `get_referee_board(p_event)` (assigned active-round matches) and `get_match_entry(p_match)` (admin or assigned referee). Result payload is an array of `{team_id,outcome}`. Every live mutation uses an actor-bound persisted op id; network retries reuse it. Thin broadcasts never carry outcomes.
- **Acceptance/next:** Server-enforced assignments/ACTIVE state, valid regular/opening results, caps and revocation, lifecycle pending blocker/overtime without auto-close, replay once, offline delivery after reconnect, visibility-safe cached reads and polling fallback. Local Docker is unavailable; do not install it. Implement and validate locally, commit completed work; publication of this new phase and hosted deployment remain separate.
- **Integration milestone:** Added lifecycle/result/adjustment SQL and 154 expected pgTAP assertions; referee board/confirmed regular and opening result entry; admin live controls, pending blocker, void/reset and adjustments with giver/revoked history; native IndexedDB cache/actor-bound FIFO operation queue with cross-tab leases and durable acknowledgments; thin realtime/polling fallback. Existing domain setup/import/owner RPCs use the queue; passwords/member Edge Functions and binary uploads stay online. D024/D025 record the boundaries. Public cached outcomes are redacted when visibility changes.
- **Validation milestone:** All 85 unit tests across 17 files pass with bundled Node 24 and one thread worker; the sandboxed attempt timed out before executing tests. App/spec TypeScript and production build pass (363.87 kB initial). Four new browser journeys pass, including EN/AR results, opening winners and airplane-mode reconnect. Corrected request-timing/ambiguous-selector test failures plus the overtime banner ARIA role and adjustment input label; rebuilding before the complete browser regression run. SQL runtime remains pending cloud publication.

- **Final validation:** All 86 unit tests across 17 files pass; production build passes (364.10 kB initial), app/spec TypeScript checks pass, changed-file Prettier and whitespace checks pass. All 16 browser checks pass across runs: 15 in the final combined run, then the existing English XLSX journey alone after a cold-start timeout (19.6 s). Seven new journeys cover EN/AR confirmation, opening winners, durable lost-ack reload/replay, airplane-mode reconnect, admin pending/void/close/reopen, and adjustment caps/giver/revocation. New EN/AR scoring and admin screens pass axe and 360 px overflow checks; screenshots were inspected. Lighthouse reports accessibility 100, best practices 96, performance 69. Local serial/timing overrides stay ignored; CI configuration is unchanged.
- **Defect repaired during validation:** Network profile refresh briefly cleared the same actor profile, changing private-cache scope and erasing offline staff reads. Preserve the same actor during network recovery; a unit regression and native IndexedDB reload browser journey now pass. Also corrected overtime ARIA semantics and the points input accessible name.
- **Handoff/next:** Phase 5 implementation is committed locally on codex/phase-5-live-operations; not pushed. Publish/open the Phase 5 PR when Gendy authorizes it, then run/fix cloud CI (551 expected pgTAP assertions across six suites, including 154 new). SQL was statically reviewed but has not run locally because Docker is unavailable. Phase 5 acceptance remains pending database runtime validation. No Docker installation, merge, hosted database change or deployment performed.

## 2026-10-10 — Publish Phase 4 and verify cloud CI — DONE

- **Requested by:** Gendy explicitly authorized pushing Phase 4, opening its PR and running/fixing cloud CI.
- **Preflight:** Clean `codex/phase-4-player-experience` at `b48330b`; refreshed origin, master remains `30e6da0`. Reviewed the 48-file feature/database/test/documentation diff. No history rewriting.
- **Scope/next:** Publish branch, create/attach PR against master, inspect both CI jobs, repair failures and rerun as needed. Local build, 46 unit tests, all nine browser checks across runs, app/spec TypeScript, formatting and whitespace pass. Database runtime remains pending, with 397 assertions expected. No merge or hosted deployment authorized.
- **Publication milestone:** Published `03637b0` and opened/attached [PR #7](https://github.com/peter-elmasry/BTSApp/pull/7). Existing local `Gendyadel` Git authentication succeeded after the colleague's account name had no local credential; credentials were never printed or stored. [CI run 38071136990](https://github.com/peter-elmasry/BTSApp/actions/runs/38071136990) is queued. PR is ready for cloud validation; no merge performed.
- **Cloud milestone:** Frontend job `114268607596` passes formatting, unit tests, production build, all nine browser checks with unchanged CI timing, and Lighthouse acceptance. Database job is starting Supabase; its migration and pgTAP outcomes remain pending.
- **Validation passed:** [CI run 38071136990](https://github.com/peter-elmasry/BTSApp/actions/runs/38071136990) on `03637b0` passes both jobs. Fresh startup/reset applies `0007_phase4_public.sql`; all 397 pgTAP assertions across five suites pass, including 87 public-read assertions, plus owner seed/auth smoke checks. Frontend passes 46 unit tests, nine browser tests with standard CI timings, formatting, production build (340.26 kB initial) and Lighthouse acceptance (accessibility 100). No code repair was needed after cloud execution.
- **Handoff:** Phase 4 implementation is ready for review in PR #7. Publish this final documentation record and update the PR with verified results; the documentation commit triggers its own head checks. No merge or hosted deployment performed. Phase 5 live operations follows after Phase 4 review/merge; Phase 0 hosted acceptance remains separate.

## 2026-10-10 — Phase 4 public player experience — HANDOFF

- **Requested by:** Gendy; continue the next phase, retaining the earlier divide-and-conquer, DRY and KISS direction.
- **Preflight:** Clean Phase 3 branch; fetched origin, confirmed PR #5 merged and its 310 database assertions passed. New `codex/phase-4-player-experience` starts at latest master `30e6da0`, preserving the Vercel fix and colleague's handoff.
- **Scope/owners:** Database agent owns migration/public read RPCs and pgTAP; UI agent owns public feature pages and `player` translations; state agent owns event/team-selection/server-clock stores, guards and focused tests. Primary owns shared types/API, shell/routes, browser checks, integration, docs and commit.
- **Contract:** Public reads use `get_current_event`, `get_bootstrap(p_event)`, `get_schedule(p_event)` and `get_team_view(p_event,p_team_code)`. Explicit field allowlists; hidden schedule omits outcome keys for anonymous/referee/guide callers, while team view returns only the requested team's outcomes. Guide phone follows the event flag. No direct table grants or mutations added.
- **Acceptance/next:** Confirmed team choice/deep links, event-scoped persistence and switching, mobile EN/AR pages, server-derived countdown/overtime and visibility-safe reads. Local Docker remains unavailable; no installation. Implement, run frontend checks and prepare database verification on GitHub. Commit completed work; no new phase publication/merge/deployment authorized by this request.
- **Integration milestone:** All three delegated scopes delivered: six public pages and shared match/state UI, typed read API, event/team stores, guards and clock, four public RPCs and 87 expected pgTAP assertions. Shell now shows the current event/team and live round banner; retired the demo route/components. D023 records visibility and stale-response behavior; README describes the player flow.
- **Checks in progress:** Production build passes (340.01 kB initial). New EN/AR player journeys, QR/overtime checks, no-event accessibility and offline shell pass. Existing Arabic XLSX check passes; English download hit a local 30 s timeout and will be rerun alone. Unit suite compiled after a nullable-label correction but its worker timed out before executing; rerunning without the competing workload. Database runtime remains unrun pending GitHub CI publication.
- **Final frontend checks:** All 46 unit tests pass using bundled Node 24 and one thread worker; system Node 22 worker startup timed out without running tests. Production build passes after mobile-header visual correction (340.25 kB initial), app/spec TypeScript checks pass, all changed files pass Prettier and whitespace checks. All nine browser checks pass across runs: eight in the combined run, then the existing English XLSX journey alone (25.2 s) with a 15 s local assertion window after cold-load/download timeouts. Local timing overrides remain ignored; CI configuration is unchanged. Both player screenshots were inspected; no mobile overflow or axe violations in checked EN/AR pages.
- **Handoff/next:** Implementation is committed locally on `codex/phase-4-player-experience`, not pushed. Publish this branch/open its Phase 4 PR when authorized, then run/fix cloud CI (expected 397 pgTAP assertions across five suites, including 87 new). Do not mark Phase 4 accepted until database runtime checks pass. No Docker installation, hosted database changes or deployment performed.

## 2026-10-10 — Publish Vercel header fix — DONE

- **Requested by:** Peter authorized proceeding with publication/merge and reporting when ready to deploy.
- **Preflight:** Clean `fix/vercel-cache-pattern` at `0d6e330`; refreshed origin and confirmed no newer master commits. Reviewed the three-file configuration/documentation diff.
- **Scope:** Publish the validated fix, create a PR, verify CI, merge after passing checks and report deployment readiness. Vercel may automatically deploy the merge if its GitHub connection is active.
- **Validation retained:** Vercel routing parser reproduces the old failure and accepts the corrected configuration; hashed/unhashed asset selection, formatting and whitespace checks passed.
- **Publication:** Pushed `fix/vercel-cache-pattern` and opened [PR #6](https://github.com/peter-elmasry/BTSApp/pull/6). Explicitly selected the existing `peter-elmasry` Git credential to bypass an account-selection prompt. No credential values were exposed or stored.
- **Milestone:** Vercel's `bts-app` preview deploy succeeds, confirming the invalid-source deployment blocker is resolved. Frontend CI passes on initial PR head `a9962ae`; database CI is still running at this documentation milestone. This final documentation update must receive its own head checks before merge.
- **Next:** Inspect current PR #6 checks and merge state; merge the verified head once CI passes. An active Vercel GitHub connection should deploy updated `master` automatically; verify the production deployment and owner login separately. Hosted authentication and login acceptance are not claimed here.
- **Final verification:** Final head `d7149c8` passes frontend/database CI run `38059628721` and Vercel preview. PR #6 merged as `30e6da0`. Vercel automatically deployed that master commit; GitHub's Vercel status and Production deployment `6982234229` both report success. No manual redeploy is needed. Owner login is the next user acceptance check.
- **Documentation handoff:** This final result is committed locally on `docs/vercel-production-handoff`; not published. The application fix and earlier progress record are already merged into master.

## 2026-10-10 — Vercel asset header pattern — HANDOFF

- **Requested by:** Peter; confirm the Supabase URL and fix Vercel's invalid header source error.
- **Preflight:** Working tree clean; fetched origin and based `fix/vercel-cache-pattern` on latest `master` (`d121e55`, including merged Phase 3). Prior local documentation remains preserved on `docs/hosted-deployment-handoff`.
- **Scope:** Correct the nested capturing group in `vercel.json`; preserve hashed-asset caching and service-worker/HTML revalidation. Update decisions and validate route parsing. No schema, permissions or credentials changed.
- **Changes:** Replaced `(js|css)` with `(?:js|css)` in the hashed-asset source; recorded D022. Peter reports hosted owners were created successfully; hosted owner sign-in and Vercel acceptance remain unverified.
- **Validation:** Vercel routing-utils 6.5.0 reproduces the original invalid configuration and accepts every corrected header/rewrite. Its path-to-regexp parser matches hashed JS/CSS and excludes unhashed assets, HTML and service-worker files. Changed-file Prettier and whitespace checks pass. The validator was installed only under ignored `artifacts/`; application dependencies are unchanged. An initial check used the wrong wrapper signature; the corrected validator invocation passed.
- **Next/publication:** Fix committed locally on `fix/vercel-cache-pattern`; not pushed per AGENTS.md. Publish/review/merge this branch when requested, then redeploy Vercel from updated `master` and test owner login. No hosted deployment was run during this fix.

## 2026-10-10 — Publish Phase 3 and verify cloud CI — DONE

- **Requested by:** Gendy explicitly authorized pushing the ready phase and creating a PR.
- **Branch/state:** Clean `codex/phase-3-xlsx-import` at `9381db2`; refreshed origin and checked for an existing open Phase 3 PR (none found). Merge conflicts are resolved.
- **Scope:** Review the phase diff, publish this branch without rewriting history, create/attach a PR against `master`, and inspect/fix its CI checks. Local verification already passed 28 unit tests, five browser tests, build, TypeScript and formatting; the 69 new pgTAP assertions still need cloud execution.
- **Next:** Commit this publication record, push, open the PR and verify frontend/database results. No merge or hosted deployment requested.
- **Publication milestone:** Pushed `084a1aa` with upstream tracking and opened [PR #5](https://github.com/peter-elmasry/BTSApp/pull/5), attached to this chat; GitHub reports mergeable. Integration PR creation returned 403 and the browser bridge failed; creation succeeded through GitHub's API using existing Git authentication without printing/storing credentials. Cloud CI run `38053285280` is in progress.
- **Validation passed:** [Cloud CI run 38053285280](https://github.com/peter-elmasry/BTSApp/actions/runs/38053285280) on code head `084a1aa` passes both jobs. Fresh migration/reset includes `0006_phase3_import.sql`; all 310 pgTAP assertions across four suites pass, including 69 import assertions, plus owner seed/auth smoke checks. Frontend formatting, 28 unit tests, build, five browser tests and Lighthouse acceptance pass. This supersedes the earlier Phase 3 SQL-runtime blocker; dependency findings remain documented in D021.
- **Handoff/next:** Phase 3 is ready for PR review. PR #5 now includes the passing CI evidence; this documentation-only verification note is published on the same branch. No implementation changes were needed after cloud execution. Review/merge PR #5 when approved; hosted deployment remains separate and was not performed here.

## 2026-10-10 — Resolve Phase 3 merge conflicts — DONE

- **Requested by:** Gendy; fix the in-progress merge conflict.
- **Branch/state:** `codex/phase-3-xlsx-import` at `1da966c`, merging `bd1de7b` from master. `docs/DECISIONS.md` and `docs/PROGRESS_LOG.md` are unmerged; workflow/README changes are already staged and will be preserved.
- **Scope:** Retain both import/deployment histories and completed Phase 2 CI evidence; keep master's published IPv4 decision as D019, renumber import decisions to D020/D021, and update their references. Validate formatting, merged content and Git state, then finish the merge with a local commit.
- **Resolution:** Retained both parent histories, including Phase 3 implementation notes, IPv4 deployment handoffs and the completed Phase 2 CI results. D019 remains the IPv4 decision; import/ExcelJS decisions are D020/D021 with updated references. Incoming workflow and README content are preserved; normalized line endings for Prettier.
- **Validation:** Both-parent history retention, unique decision IDs, unchanged incoming workflow content, both README sections, tracked conflict-marker scan, changed-file Prettier and whitespace checks passed. No application/SQL code changed; runtime suites were not rerun for this documentation conflict resolution.
- **Handoff/next:** Completed the in-progress merge with a local Conventional Commit on `codex/phase-3-xlsx-import`; no push or deployment requested or performed. Phase 3 cloud database verification remains pending publication.

## 2026-10-10 — Publish and merge IPv4 deployment fix — HANDOFF

- **Requested by:** Peter explicitly authorized merging `fix/supabase-ipv4-deploy`.
- **Preflight:** Clean working tree; refreshed origin; `master` remains `5df1bcb` with no intervening colleague commits. Reviewed the workflow change and retained the previously verified formatting/CLI checks.
- **Scope:** Publish this branch, open a PR against `master`, merge after required checks, then inspect the automatically triggered hosted deployment. No force push or history rewriting.
- **Next:** Confirm PR merge and hosted deployment result. `SUPABASE_DB_URL` must be configured in GitHub's `production` environment; its value is never read into documentation.

## 2026-10-10 — Supabase deployment IPv4 connection — HANDOFF

- **Requested by:** Peter; investigate the failed hosted deployment.
- **Branch:** `fix/supabase-ipv4-deploy`, based on current `master` at `5df1bcb`; initial working tree clean.
- **Evidence:** Run `38041380671` links successfully, then `supabase db push` fails with `IPv6 is not supported on your current network`; Edge Functions are skipped. The Node action warning is unrelated.
- **Scope:** Use an explicit Session pooler database URL for migrations; update deployment instructions and decisions. No schema or application permission changes, no hosted retry or push in this session.
- **Changes:** Deployment now checks the `SUPABASE_DB_URL` environment secret and explicitly supplies it to `db push`; README documents the Session pooler URI and D019 records the transport decision.
- **Validation:** Changed-file Prettier and `git diff --check` pass. Installed CLI help confirms `db push --db-url` accepts a percent-encoded connection URI. Initial help invocation was sandbox-blocked writing telemetry; an unrestricted help-only retry passed. No hosted migration or deployment was attempted.
- **Next:** Add the Session pooler URI as `SUPABASE_DB_URL` in GitHub's `production` environment, publish/merge this fix, then run Deploy Supabase on updated `master`. Changes are committed locally on this branch, not pushed per AGENTS.md; repository credentials/secrets are unchanged.

## 2026-10-10 — Phase 3 XLSX setup import — HANDOFF

- **Requested by:** Gendy; start next phase with divide-and-conquer subagents, DRY and KISS.
- **Branch/state:** PR #3 merge verified at `5df1bcb`; branch `codex/phase-3-xlsx-import` starts from refreshed `origin/master` and carries final Phase 2 CI evidence via `925f8ed`. Working tree was clean.
- **Scope/owners:** Database agent owns new Phase 3 migration/pgTAP; workbook agent owns lazy ExcelJS template/parser/validation and unit tests; UI agent owns the import page/template/tests and import translations. Primary owns shared contract, API/types/routes/dependency installation, integration, docs, checks, and commit.
- **Contract:** `import_event_setup(p_op_id,p_event,p_payload,p_mode,p_dry_run)` accepts `{event,teams,games,rounds,matches,staff}` with optional original `row` on array records; matches use `round_number/game_code/team_a_code/team_b_code`, staff use `member/role/game_codes/team_code`. Reports `{valid,errors:[{sheet,row,column,code}],counts:{teams,games,rounds,matches,staff},applied}`. Mode UPSERT/REPLACE. Client preview plus server dry-run before explicit confirm; server atomic validation/apply and replay safety mandatory.
- **Acceptance:** Bad row imports nothing with row errors; valid workbook builds event; REPLACE blocked after any round starts. Reuse Phase 2 rules/RPCs, preserve EVENT_ADMIN roles during setup replacement, and load ExcelJS only on demand.
- **Environment:** Local Docker remains unavailable and disk-limited; do not install Docker. Phase 2 cloud CI passed 241 database assertions. Hosted project acceptance remains pending; Phase 3 implementation is explicitly requested.
- **Integration milestone:** All three delegated scopes delivered. Template/parser, guarded EN/AR preview/confirmation page, and atomic server import are integrated; added 10 workbook, 6 confirmation-safety, 2 browser tests and 67 pgTAP assertions. Browser checks caught and fixed ExcelJS CommonJS default-export interoperability; Angular tests required TestBed dependency mocks instead of relative module mocks. Serial local workers avoid startup timeouts. Existing mobile accessibility/offline tests passed; final checks remain in progress.
- **Verification milestone:** 28 unit tests, app/spec TypeScript checks, changed-file Prettier and production build passed. All five production browser checks passed (real XLSX round trip in EN/AR with mocked RPC, accessibility/mobile overflow, shell/offline coverage); mocked import tests block service workers to keep RPC interception deterministic. Visual QA prompted success-focus and narrow signed-in header fixes, now undergoing final recheck. Optional blank leaderboard visibility preserves the existing value; database regression suite expanded to 69 assertions. No database runtime result claimed: local port 54322 has no Supabase service, and publishing this new branch for cloud CI has not been authorized.
- **Final checks/outcome:** Rechecked after focus/header fixes: all 28 unit tests and five Chromium tests pass; production initial bundle 324.46 kB with ExcelJS lazy-loaded separately. App/spec TypeScript, changed-file Prettier and whitespace checks pass. Local Vitest uses temporary ignored configuration with one thread worker; default forks timed out before test execution. Browser runs use a temporary port 4300 to preserve the user's existing dev server. Both languages were visually inspected. D020/D021 record import semantics and the two moderate dependency-audit findings; SQL runtime remains unverified.
- **Handoff/next:** Phase 3 implementation and docs are committed locally on `codex/phase-3-xlsx-import`; nothing pushed or deployed. Request publication of this branch and a PR, then run/fix cloud CI (expected 310 database assertions across four suites). Do not mark Phase 3 accepted until its database checks pass. Hosted Supabase/Vercel acceptance remains separate.

## 2026-10-10 — PR #3 cloud database verification — DONE

- **Requested by:** Gendy; explicitly authorized pushing and resolving CI failures promptly; use GitHub runners because local disk space is insufficient.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `e0f1a50`; fetch/push confirms origin and PR #3 already contain both repair/setup commits. Earlier unpushed notes are superseded by this verified remote state.
- **Scope:** Inspect latest GitHub CI, repair remaining database failures, run available formatting checks, commit and push fixes, and verify the cloud database result. No local Docker installation needed.
- **Milestone:** CI run `38039617333` passes foundations and Phase 1 owner suites. Phase 2 stops at malformed dollar quoting in the two newly added regression assertions; corrected those delimiters.
- **Milestone:** Run `38039934684` executes all 240 assertions, with only two Storage delete checks failing because upstream blocks direct SQL deletes. Tests now emulate the Storage API transaction setting for synthetic metadata fixtures, retain RLS, and assert actual admin deletion. Production safeguards unchanged.
- **Validation passed:** GitHub CI run `38040208562` on pushed code commit `7c94050`: all 241 pgTAP assertions across three suites, fresh migration reset, owner seed/auth smoke checks, and the full frontend job (formatting, unit tests, build, browser tests, Lighthouse). Local changed-file Prettier and `git diff --check` passed.
- **Publication/handoff:** Fixes `78d926c` and `7c94050` are pushed to PR #3. This final verification record is committed locally; no further code changes are required. PR ready for review; no merge requested.

## 2026-10-10 — Local Supabase runtime setup — HANDOFF

- **Requested by:** Gendy; set up local Supabase and execute/fix database checks.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `827198c`, one local commit ahead; no push authorized.
- **Scope:** Check Windows virtualization/WSL, install/start Docker if supported, start Supabase, run pgTAP, and repair remaining failures.
- **Verified prerequisites:** Windows 10 Home build 19045 on Lenovo 81AX; Intel i7-8550U supports SLAT, but `VirtualizationFirmwareEnabled=false` and `HypervisorPresent=false`. Inbox WSL does not support `--version`; modern WSL setup remains needed.
- **Installation attempt:** WinGet resolved Docker Desktop 4.94.0 and started its official download, but no download progress or installed executable was observed. Stopped the attempt after confirming the BIOS prerequisite blocker; Docker installation is not claimed.
- **Checks/outcome:** Supabase startup and pgTAP were not run because no usable Docker engine is available. Existing database fix `827198c` remains local and unpushed.
- **Next:** Gendy must enable Intel virtualization in BIOS/UEFI and restart. Then install/update WSL and Docker Desktop, start the engine, run `npx supabase start` and `npm run test:db`, and repair any further failures. No automatic restart was attempted.

## 2026-10-10 — PR #3 database check repair — HANDOFF

- **Requested by:** Gendy; inspect failing `npm run test:db` and explain checksum.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `157f3e1`; PR #3 head matches local HEAD.
- **Scope:** Inspect CI failures, repair database tests or implementation as indicated, run available checks, and commit without pushing.
- **Confirmed causes:** CI run `38035607700` shows NULL exception DETAIL breaking Phase 2 error codes; seeded owners inflating Phase 1/2 directory counts; direct authenticated table reads aborting both suites.
- **Changes:** Fixed `phase2_fail` optional details; added two error-helper regression assertions; fixture-scoped directory counts; privileged test-runner observations/constraint checks; authenticated setup ID lookups through `get_event_setup`. Client grants remain unchanged.
- **Validation:** Local `npm run test:db` blocked by ECONNREFUSED at `127.0.0.1:54322`; runtime results are not claimed. Prior PR frontend job passed. Changed-file Prettier and `git diff --check` passed.
- **Next:** Fix is committed locally as `fix: repair database error handling and role-aware tests`, without pushing, per repository rules. Push when requested, then confirm the PR database job passes. Docker checksum verification succeeded in the failed run and is unrelated to SQL failures.

## 2026-10-10 — Phase 2 manual event setup — HANDOFF

- **Requested by:** Gendy.
- **Branch:** `codex/phase-2-event-setup`, branched from Phase 1 commit `4cb476a` on `codex/phase-1-auth-owner`; PR #2 is now merged into `master`.
- **Dependency finding:** Phase 3 depends on Phase 2's event setup schema and validation rules: teams, games, rounds, matches, event staff, uniqueness constraints, and settings. Per Gendy's instruction, implement/validate Phase 2 first; do not start Phase 3 implementation in parallel.
- **Parallel scopes:** Database schema/RPCs/pgTAP tests in `supabase/**`; manual setup frontend components and focused frontend tests in a separate feature directory under `src/app/features/manage/**`. The primary agent owns integration types/service/routes and final combined validation.
- **Phase 1 prerequisite note:** Phase 1 frontend and SQL/Auth acceptance passed in CI (D015); hosted project configuration/deployment remains pending. Phase 1 is merged to `master`.
- **Base verification:** GitHub confirms Phase 1 PR #2 is merged into `master` at `42c6978`; local `origin/master` is now refreshed. Phase 2's PR target is `master`.
- **Integration contract:** Frontend and DB scopes use the same Phase 2 RPC signatures, with client-generated `p_op_id` UUIDs for every mutation. `get_event_setup` returns `eligible_members` containing active member IDs/names/usernames/login availability; it excludes phone and auth identifiers and is limited to owners/event admins. Guides may lack login; admin/referee assignment requires login. Only owners can assign/remove EVENT_ADMIN; event admins can assign REFEREE/GUIDE.
- **Milestone:** Added the lazy Event Admin setup route/navigation, owner event-card link to setup, EN/AR `manage.*` translations, and the complete setup UI/database contract.
- **Database milestone:** Added the Phase 2 migration and pgTAP tests for schedule uniqueness/opening-match safeguards, completed-match edit restrictions, roles, audit/idempotency, storage policy scope, and validation. SQL was statically reviewed; local pgTAP could not run because Postgres at `127.0.0.1:54322` refused connections (Docker/Supabase runtime unavailable).
- **Integration review:** Settings include event names; the UI joins flat matches/roles/referee assignments from `get_event_setup`; OPENING schedules use the generator RPC; role assignment follows owner/event-admin permissions. Game images upload to a public WebP bucket with event-scoped write policies.
- **Storage/settings milestone:** The DB contract now includes event names in settings, with required English/optional Arabic validation. Added a public WebP `game-images` bucket capped at 5 MiB and event-folder-scoped owner/admin writes; pgTAP coverage includes cross-event/referee denial and object lifecycle. Runtime DB validation remains blocked locally.
- **Validation results:** Production build passed (323.38 kB initial bundle); focused Phase 2 Vitest passed 2/2; serial Playwright E2E passed 3/3; changed-file Prettier and `git diff --check` passed. `npm test` stalled without output and was stopped; direct focused Vitest is green. `npm run test:db` reaches Supabase CLI but local Postgres refuses `127.0.0.1:54322` (ECONNREFUSED; Docker/Supabase is not running), so pgTAP execution remains pending in CI.
- **CI formatting finding/fix:** The repo-wide `npm run format:check` fails on 37 unchanged files. Changed Phase 2 files pass. Updated the CI workflow to fetch the comparison base and format-check only PR/push changed files, preserving checks without requiring unrelated formatting churn.
- **Publication:** Commits `aee9d5b` (`feat: add manual event setup management`) and `f2021d7` (`chore: format-check changed CI files only`) are published on `origin/codex/phase-2-event-setup`; upstream tracking is set.
- **PR blocker:** GitHub `create_pull_request` returned 403, `Resource not accessible by integration`. The CUA browser bridge also failed before tab discovery (`failed to write kernel assets: The system cannot find the path specified`). PR #2 is merged, but Phase 2 PR creation is still pending. Compare URL: `https://github.com/peter-elmasry/BTSApp/compare/master...codex/phase-2-event-setup?expand=1`.
- **Handoff:** Phase 2 implementation is ready for review on `codex/phase-2-event-setup`. Create the PR against `master` from the compare URL or with an integration that has pull-request write permission, then attach it here. Do not start Phase 3 before Phase 2 is reviewed/merged.

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
