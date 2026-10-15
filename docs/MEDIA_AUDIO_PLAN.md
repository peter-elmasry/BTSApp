# Hearts, opening media, team pictures, colours and sound

Requested by Gendy on 2026-10-15. Planning baseline: fetched `origin/master`
at `a774e36` (PR #23). Requirements live in implementation plan §22;
this document specifies the proposed implementation and verification.
No application or database change is delivered by this planning commit.

## Review of the fetched changes

The previous checkout was `9e32743`, on the owner touch-target branch.
The merged work since its common ancestor changes 189 files and includes
Phase 8, UX U0–U8, production walkthrough fixes, member profiles and UX rounds 2/3.
The review inspected the commit/file inventory, new documentation and the
contracts relevant to these extensions. This is a planning review, not a
completed line-by-line security audit of all 15,007 added lines.

Current behaviour to retain:

- Migrations `0016`–`0023` add public referee names, LIVES scoring, late results,
  backdated starts, contacts/breakdowns, referee history, own-profile edits,
  signed hearts gains, single names and a signed-in staff directory.
- Ending a round may leave late results; assigned referees may submit their first
  result after close. Corrections in closed rounds remain admin-only (D041/D050).
  Sound must fire when the result is committed, even if it is late.
- D053 permits 1–9999 starting hearts, signed integer gains and negative totals.
  A draw is not currently a fractional unit. Do not restore D038's zero floor.
- D054 uses one visible name with bilingual storage compatibility. New labels
  must retain the current Arabic/English translations and English event terms.
- Anonymous visitors see their chosen team's detail views (D046); published
  leaderboard/display and the new opening attachment are public exceptions.
- Public broadcasts contain identifiers only; clients refetch through scoped
  RPCs. Hidden result rules remain in force for sounds as well as visual content.
- Setup workbook v5 accepts v3/v4; avatars and palette are catalog-based.
  Custom HEX parses on import and `colorName()` preserves unknown HEX on export.
  The implementation review corrected the earlier planning suspicion; add regression coverage.
- Game image preparation already decodes JPEG/PNG/WebP, limits source size and
  dimensions, and converts to <=1024 px WebP before upload (D034).
- `ds-lives-meter` displays individual emoji only up to 12 slots, then emoji × N.
  `ds-avatar` only supports catalog SVGs. There is no event sound service.
- Realtime currently debounces refetch by 500 ms, disconnects hidden tabs after
  60 seconds and uses polling fallback. It cannot promise simultaneous playback
  across devices or background delivery.

Documentation revisions: §19 no longer excludes team uploads; §20 now points to
D053 for current scoring; Phase 5 no longer claims a pending-match close blocker
or denies every closed-round submission. Earlier progress entries and acceptance
evidence remain historical. Duplicate D029–D031 IDs predate this session: future
references must use their titles as well as IDs until separately reconciled;
do not blindly renumber IDs used in code or old handoffs. PHASE_0_RESULTS remains
historical acceptance evidence and does not establish today's hosted status.

## 1. SVG hearts in one row

Replace emoji rendering with a reusable `ds-heart-icon` (inline SVG paths) and
update `ds-lives-meter`. Use a red full heart, a visibly cracked/half-broken red
heart for DRAW, and an outlined/faded depleted state. Include text labels so
colour and the crack alone do not carry meaning. Use the same icons in the
score summary, standings, result entry, breakdown and life-change overlay.
Retain `life_emoji` in stored/read contracts for older clients; hide the symbol
picker in the new hearts UI, since Gendy requests a fixed red SVG heart.

**Confirmed clarification from Gendy:** every DRAW in LIVES mode removes exactly
0.5 heart, with a half-heart breaking animation and a dedicated draw sound.
This supersedes D053's configurable integer draw gain for hearts events; POINTS
draw scoring is unchanged. Win/loss/forfeit retain their configured gains.
Existing completed draws in hearts events are recalculated using -0.5, because
standings are computed from current rules; show an explicit migration notice
and invalidate affected manual tie positions. Opening rounds still forbid DRAW.

Use exact PostgreSQL numeric values restricted to 0.5 increments wherever hearts
are persisted/projected; retain whole-number starting hearts and adjustments for
this release. Audit every integer cast in standings, public/live breakdowns,
receipt builders, settings/import RPCs and export; replace truncating casts on
hearts totals/deltas. A shared total contract may be numeric for both modes while
POINTS validation remains integer-only. JavaScript represents half-integers
exactly; never round them for display/ranking/export. Remove/disable the editable
hearts draw-gain field and show the fixed -0.5 rule in Setup and the workbook.
Old workbook draw settings must not override it: report a clear compatibility
warning and normalise hearts DRAW to -0.5 server-side on import. Bump the template
version if its fixed draw row changes, retaining explicit old-version support.

The meter draws one full SVG per positive whole heart and a half-broken SVG for
a remaining 0.5 heart (for example 2.5 = two full hearts plus one half heart).
Zero/negative totals use
an empty state plus the exact signed numeric total, never a fabricated negative
icon count. Show the exact numeric total beside the row for accessibility and
quick reading; never use the old single-icon × N fallback.

Keep hearts in one non-wrapping row inside a bounded, keyboard-scrollable region.
For large totals use horizontal virtualisation (including off-screen focus/
scroll handling) rather than inserting thousands of SVGs in every leaderboard
row. Small totals must all appear together; large totals remain individually
inspectable by scrolling. Preserve initial/depleted slots where practical, but
the accessible label must describe the server total rather than counting DOM nodes.

Checks: 0, 0.5, 1, 2.5, 3, 12, 13, 100, 9999, gains above initial and negative totals;
WIN/DRAW/LOSS/FORFEIT/PENDING/VOID; EN/AR at 360 px; reduced motion; screen-reader
label, keyboard scrolling and no horizontal page overflow. Database checks must
cover repeated draws (3 -> 2.5 -> 2), draw at zero (-> -0.5), signed gains,
adjustments, result corrections/reset/void, POINTS non-regression, recalculated
historical draws, ties and exact XLSX round trips. Reduced motion uses a static
half-heart change card; the draw sound follows audio controls independently.

## 2. Public opening-round attachment

Confirmed first release: one optional image or PDF per OPENING round, managed in
Setup -> Rounds. Add upload/preview/replace/remove, a display toggle and an
optional title/alternative text. Images display inline; PDFs offer a preview
where supported and an Open/download link everywhere. Video is outside this scope.

Add nullable round metadata (`attachment_path`, MIME kind, title/alt and
`attachment_visible`) through a new migration. Validate that only OPENING rounds
can carry it. Add a dedicated idempotent admin RPC to save/remove this metadata,
with event permission checks, path ownership validation, audit and thin broadcast.
Expose only the visible attachment fields in the public bootstrap builder and
the setup read; do not expose private staff fields or results.

Use a public `opening-attachments` Storage bucket. Writes/removal require an
active owner or that event's administrator and an event-prefixed path such as
`<event-id>/<round-id>/<random-id>.webp` or `.pdf`. Anonymous users can read
published files without signing in or selecting a team. A public bucket means
turning off display does not make a previously shared URL private; remove the
object to revoke ordinary future reads (downloaded/cached copies remain public).
Make that behaviour clear in the admin form.

Reuse image conversion for images. Proposed limits: image sources follow D034,
converted image <=5 MiB; PDFs <=10 MiB, validated as PDF, no HTML or uploaded SVG.
Set bucket limits/MIME allowlists and serve PDFs as files, without injecting
their contents into the DOM. Upload first, save metadata second; failed saves
clean up the new orphan only, and successful replacements remove the old object
after the reference is committed. Binary uploads remain online-only.

Render a shared opening-media card outside team-choice and leaderboard gates on
Home (including no team chosen), Schedule, Now and the venue display shell.
When published, it remains accessible before/during/after the opening round
until hidden or removed. Hidden standings must not hide this card; the display
shell must reveal no standings while its normal visibility gate is closed.

Checks: anon with/without a selected team; hidden leaderboard; guide, referee,
admin and owner; cross-event upload/path attacks; regular-round rejection;
replace/remove, MIME/size failures, broken link and mobile PDF fallback;
first public load, realtime update and cached/offline unavailable states.

## 3. Uploadable team picture

Add optional `teams.image_path`, retaining `avatar_key` as fallback. Setup -> Teams
gets photo upload/preview/remove plus the existing catalog picker. Reuse D034's
conversion through a neutrally named shared image-preparation helper; do not
duplicate its race cancellation, resource cleanup or validation logic.

Use public `team-images` Storage with event-scoped owner/admin write policies,
WebP output <=5 MiB and unique immutable object paths. Validate saved paths in
the team RPC; audit metadata changes and emit roster invalidation. RLS on Storage
is the deliberate exception to domain-table writes via RPC, as for game images.

Carry `image_path` through setup, bootstrap, public team builders, standings,
quick look, live/referee participants and result-entry contracts. Extend
`ds-avatar` once with a safe picture URL and load-error fallback, preserving the
team-colour border. Reuse it everywhere (picker, header, cards, tables, breakdown,
display, result tiles); use cover for thumbnails and contain/full image in preview.

Do not embed binary files or arbitrary remote URLs in XLSX. UPSERT preserves a
team's picture when the workbook omits it; REPLACE deletion must arrange storage
cleanup without deleting still-referenced files. Exports retain stable team names
and codes; binary image export is out of scope. Cleanup may be retryable after
database success and must never roll back a committed team edit in the UI.

Checks: real PNG/JPEG/WebP conversion, orientation/aspect ratio, rejection,
selection races, save failure/retry, fallback image, import preservation,
anonymous reads and cross-event/referee write denial.

## 4. Custom HEX colours in configuration

Keep the default palette; add a labelled `#RRGGBB` text field synchronised with
the existing colour picker, preview swatch and Save. Trim input and normalise to
uppercase. Reject shorthand, alpha, CSS functions and malformed strings on client
and server. Existing `teams.color_hex` already validates six-digit HEX.

Also let event admins save named custom swatches in event configuration, reusable
in single/bulk team setup. Proposed representation: event-scoped palette entries
with name and HEX, written through an audited/idempotent settings RPC; defaults
are built-in and do not need duplicate database rows. Deduplicate case-insensitive
HEX; deleting a custom swatch never changes teams already using that colour.
Adding/removing swatches is configuration, not a scoring change.

Preserve workbook colour round trips: unknown HEX exports as that exact HEX.
Add regression coverage for this existing behaviour. Generated dropdowns include custom swatches and
still accept literal HEX; avoid requiring a workbook version change unless its
layout changes. Preserve accepted v3/v4/v5 files and current validation semantics.

Use colour as an accent; readable text remains brand ink or uses tested contrast.
Checks: save/reload, edit/bulk add, duplicate/invalid values, white/dark swatches,
custom HEX XLSX round trip, permissions and no unintended tie/scoring changes.

## 5. Sound configuration and event delivery

Place the supplied audio in `public/sounds/` with these exact filenames:

| Event                         | Filename          | Audience                              |
| ----------------------------- | ----------------- | ------------------------------------- |
| Successful round start        | `round-start.mp3` | All viewers, including anonymous      |
| Successful manual round end   | `round-end.mp3`   | All viewers, including anonymous      |
| Committed WIN result          | `match-win.mp3`   | Viewers following the winning team    |
| Committed LOSS/FORFEIT result | `match-loss.mp3`  | Viewers following that team           |
| Committed DRAW result         | `match-draw.mp3`  | Viewers following either drawing team |

Runtime URLs are `/sounds/<filename>` (Angular copies `public/` assets). Prefer
short MP3 clips: 1–3 seconds for rounds, 3–6 seconds for results, <=500 KiB each,
consistent volume and no leading silence. Supply audio the project may distribute.
Gendy explicitly requests the draw sound with the half-heart animation. Missing files disable
only that cue and appear as unavailable in the admin sound test.

Add typed `core/audio/event-sound.service.ts` plus a static filename manifest.
Event Settings gains a master switch, per-cue switches and Preview buttons;
settings use existing audited/idempotent RPC rules and public projection.
Device controls offer Enable sound, mute and volume for players/staff/display.
Before playing any cue, show a dismissible app prompt: "Enable event sounds?"
with **Enable sound** and **Keep muted** choices. Sound starts disabled until
the viewer explicitly opts in; any unrelated tap must not enable it. Choosing
Keep muted or dismissing leaves browsing fully usable without sound and avoids
repeated prompts. A persistent sound control lets the viewer opt in later or
mute again. This is app consent, not a browser permission dialog; Enable sound
also supplies the browser activation gesture. Preview buttons play only after
explicit activation/consent. Test no cue before consent, decline/dismiss,
later opt-in and immediate mute cancellation.
Remember preference, but re-establish browser activation when needed after reload;
logout clearing follows D047. Event enablement never overrides device mute.

Browser playback requires activation on many devices: create/resume an
AudioContext from the Enable sound gesture, preload/decode clips, then play
buffered cues on confirmed events. Handle rejected/suspended playback with a
visible re-enable control. See [MDN autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
Immediate sound for every phone without prior interaction is not technically
guaranteed; offline, muted, locked/background devices and network latency also
prevent guaranteed synchronous playback. Venue display must be enabled/tested
once before the event. No notification/push service is introduced.

Round cues must correspond to committed actions, not timer expiry. Add a separate
low-latency signal path to the shared realtime service, before its normal 500 ms
refetch debounce, carrying only an allowlisted cue/action identifier, round ID,
operation/event occurrence ID and server occurrence timestamp. Validate the
payload and retain identifier-only public delivery: never broadcast team outcomes.
Server round mutations emit the cue transactionally only on a new operation.
Distinguish START from CLOSE; extensions/settings/reopen do not play a new start
sound by default. Backdated starts cue now at action commit, not at `started_at`.

Match broadcasts trigger an immediate visibility-aware own-team RPC read. Play
only when it confirms that team's newly committed WIN/LOSS/FORFEIT/DRAW. Never infer
a result from another team's sound or play every winner and loser on every phone.
Staff with no followed team and venue display get round cues only; guides follow
their selected guided team. Support opening matches with multiple winners and
late results. Results in both POINTS and LIVES modes use the actual outcome, not
whether a configured gain is positive/negative.

Deduplicate by event/action occurrence, not merely match ID: retries/refetches
must not replay; corrections need an explicit occurrence/version and play only
for a newly changed confirmed outcome. Reset/VOID must not celebrate. Initial
load establishes a baseline; old results, reconnect snapshots and previously
missed cues never play a backlog. Propose a 10-second freshness window and use
synchronised server time. Cross-tab arbitration should elect one audible tab per
device/event; change of actor/team discards pending private reads and cues.

Polling fallback may sound later and only for a fresh, verified occurrence.
If close+start happen between snapshots, row state alone cannot reconstruct both;
add a small public round-occurrence read (no outcomes) for fallback, bounded to
the freshness window, rather than pretending polling guarantees every cue.
Protect ordering of End & start next; queue short round cues, bound the queue,
prioritise them over result sounds and drop stale clips. Mute immediately cancels
pending/current audio. Failed playback must not affect round/result submission.

Add a lazy service-worker audio asset group (`/sounds/**`) and preload after
activation; keep audio out of the initial JS bundle. A new deployment updates
cached clips through service-worker versioning. Public attachments/photos should
not be indiscriminately prefetched for all users.

Checks: real-browser gesture and blocked autoplay; muted/disabled/missing clips;
anonymous round cues; winning and losing devices in both modes; multiple opening
winners; late/corrected/reset/void results; duplicate operation/broadcast/poll;
baseline/reconnect/stale/offline events; event/team/session changes; cross-tab
deduplication; end/start ordering; foreground Android Chrome and iOS Safari plus
venue browser. Measure commit-to-playback latency under a healthy connection;
target <=1 second after a received cue, separately report network/refetch delay.

## Delivery order and acceptance

1. Exact half-heart scoring migration/contracts, SVG icons/meter, draw animation
   and custom HEX input + workbook round-trip repair.
2. Shared image preparation, team Storage/RPC/contracts and avatar integration.
3. Opening Storage/RPC/public metadata and shared attachment card.
4. Audio settings, transactional occurrence signals, client playback and assets.
5. EN/AR/mobile/accessibility QA, real Supabase permission tests and device audio
   rehearsal; update runbook and final cloud evidence.

Use separate logical commits and reviewable PR slices. Allocate migrations after
the latest actual migration at implementation time (currently `0023`); do not
reserve conflicting numbers now. Run focused unit/Playwright/pgTAP checks plus
translation validation, changed-file Prettier, app/spec TypeScript and production
build. Publish under standing authorization, verify full cloud CI, and leave
merging for explicit authorization. Documentation-only checks in this session
do not establish runtime acceptance for any proposed feature.
