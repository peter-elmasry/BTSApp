# Implementation decisions

## D073 — Exact decimal bonuses and penalties

Peter requested fractional bonuses and explicitly confirmed 0.5 and 0.25. Accept
signed, nonzero adjustments with up to two decimal places in POINTS and LIVES,
at match and event scope. Hearts-mode buttons move by 0.25; points-mode buttons
retain whole-point convenience. Either mode permits typed hundredths. Show the
decimal rule in English and Arabic, including the minus sign for penalties.

Store adjustments as exact PostgreSQL numeric with a precision check, rejecting
extra decimals instead of silently rounding. Preserve the previous integer
bounds. Replace the integer RPC signature with one numeric signature so existing
JSON integer calls remain valid without PostgREST overload ambiguity. Preserve
permissions, operation receipts, locking, audit, revocation and tie invalidation.
Caps remain configurable integers but consume exact signed decimal amounts.
Standings and breakdowns retain decimals; client cap/projection arithmetic uses
integer hundredths. Count-up preserves quarter and hundredth endpoints.

Configured match gains, starting hearts and existing half-heart draw rules are
unchanged. Migration 0034 and test 0025 reserve 0033/test 0024 for the independent
shared-notification PR; D072 is likewise reserved for that feature.

## D071 — Ask proactively for background notification permission

Peter clarified that viewers must be guided automatically rather than expected
to discover the collapsed background-notification settings. Show a localized
first-use sheet for the current DRAFT/LIVE event after the sound sheet closes.
Its Enable notifications button immediately invokes the browser permission flow
and confirms the event subscription only after server acknowledgment. Preserve
visible errors and busy feedback; do not automatically request native permission.

Remember Not now, dismissal and explicit disable per event/device. Existing saved
subscriptions keep their restoration behavior. Blocked permission shows settings
guidance; an uninstalled iPhone/iPad shows Safari/Home Screen steps. Installation
guidance and installed-app permission choices use distinct keys, so dismissing
installation instructions does not hide the later permission prompt. Unsupported
non-iOS browsers keep their existing capability guidance. Keep sound and push
consent independent and avoid overlapping modal sheets.

## D070 — First-visit sound consent and safe current-event switching

Peter requested a first-visit in-app sound modal and no repeated enable step.
Reuse the accessible sheet with explicit Enable sound / Keep muted choices;
closing also remembers mute. Existing enabled preferences remain valid. Later
visits resume Web Audio on the first trusted click or keydown, subject to the
event sound setting, foreground state and browser activation. Do not request
notification permission automatically: background push remains a separate opt-in.
No audio assets are fetched before consent and an activation gesture.

The owner current-event RPC previously changed both flags in one UPDATE. The
partial unique index can reject this when the target row is updated first.
Serialize switches with a transaction-scoped table lock, validate the target,
then clear the old flag before setting the new one. Keep the index, owner check,
operation receipt, audit and change signals. Both writes commit atomically;
invalid targets preserve the existing current event. No event setup is deleted.

## D069 — Opt-in background round notifications

Peter approved Web Push for committed DRAFT-to-ACTIVE and ACTIVE-to-CLOSED round
actions. Timer expiry, extensions, reopening and results do not send notifications.
Opt-in follows one event per browser subscription, including anonymous viewers;
it does not imply player registration. Explicit device controls save only after
server acknowledgment. Notification permission is requested only after a tap.
An opaque device receipt authorizes subscription changes; endpoints and keys are
private operational data accessible only to the service role, with bounded IP
admission and device test limits. Subscription renewal expires after 90 days.

Use a transactional per-device outbox, short-lived delivery leases, bounded retries,
two-minute freshness and provider expiry cleanup. pg_net wakes the Edge dispatcher
after commit; pg_cron retries every minute. Configuration lives in Vault, with only
the VAPID public key exposed by the public Edge route. Dispatch requires its own
secret; browser-supplied endpoints are restricted to known push providers. Delivery
must not block scoring. Never log endpoint/receipt/key/payload secrets.

A small service-worker wrapper suppresses ordinary push when a same-origin app
window is visible, retaining existing foreground audio, and opens Home on tap.
Test notifications also display in the foreground. OS notification sounds, Focus
and permissions govern audibility; custom MP3 playback and exact delivery time
are not promised. iOS/iPadOS requires Home Screen installation. Production key/
scheduler configuration and actual locked-device delivery are separate acceptance
checks; automated provider fixtures alone cannot establish them.

## D068 — Import previews recover safe omissions and stop error cascades

Workbook sheets with no frozen rows must use a normal view. ExcelJS accepts a zero-split frozen pane on readback, while desktop Excel rejects the generated template and repairs the first sheet's view. Native Excel opening of downloaded templates is separate from library round-trip and browser import acceptance.

Import name references accept Unicode normalization, Arabic alef variants, Arabic vowel marks and whitespace differences only when the result identifies one entity; exact dropdown names still win and ambiguous variants remain errors. Staff can use a current directory username. Cached username formulas are never trusted as identity. A blank emblem preserves the existing avatar by team code during UPSERT, or uses a catalog default; uploaded team photos remain governed by the existing import contract. Blank hearts draws use the server's fixed -0.5 rule. All automatic resolutions are visible preview warnings; invalid explicit avatars, unknown references, duplicate colours and invalid POINTS scores remain errors.

Show the target event name/code on the page and confirmation, and warn when workbook metadata names another source event. Request fresh setup on entry. Local errors stop before server dry-run, avoiding duplicate/cascading reports; locally valid payloads still require server dry-run and apply-time validation. Server permissions and all-or-nothing writes are unchanged. The independently repaired user workbook is outside the repository; Excel compatibility requires a native Excel open/recalculate/save check in addition to parser acceptance.

## D067 — Visible acknowledgments for completed save actions

Gendy requested clear confirmation whenever a save succeeds. Reuse ToastService's
localized five-second dismissible live message at each acknowledged save boundary,
including setup/settings/media, owner accounts/events/passwords, scoring and
adjustments, import, standings and player corrections. Keep existing inline
notices/errors and referee/profile toasts. The single active toast renders inside
the open native dialog, then returns to the page when that dialog closes, avoiding
inert/covered feedback and duplicate toast content. No generic success toast
from the background queue or reads, and no duplicate referee result announcement.

Queued writes say queued, never saved; failure, rejected import and needs-review
account writes retain their error/review state without success. Bulk setup reports
one final message and remains queued if any operation is queued. Confirmation means
the server acknowledged the mutation, independently of a subsequent list refresh.

## D066 — Owners identify the loaded frontend release from build metadata

Owners (including the seeded masry/gendui accounts) see a compact release row in
the account/More menu. Use the existing OWNER role, never a username allowlist;
other roles and guests do not render it. Display R<PR number>, short Git revision
and Production/Preview/Development with EN/AR labels and LTR identifiers.

The build derives the PR number from the repository's squash or merge commit
subject. Preview builds prefer their own Vercel PR ID and are explicitly labeled
Preview. Vercel's documented [system metadata](https://vercel.com/docs/environment-variables/system-environment-variables)
is preferred, with local Git/GitHub SHA fallback. A direct/rebase commit without a
PR subject displays its revision; missing identity displays Unavailable rather
than inventing a release number. Only validated identifiers and the environment
name enter the bundle, never raw commit messages or environment contents.

Generate through set-env before every npm production build/start/watch. No bot
commits, database counters, API credentials or runtime polling. This identifies
the frontend actually loaded, including an older offline/service-worker build;
fetching a server's newest version would falsely imply that old code had updated.
Production database/Edge deployment still needs its existing release checks.

CI builds use numbered preview-shaped metadata (the PR number, or fixture 1 on
push) to exercise a version that differs from its revision. Generated `as const`
strings are widened at the component boundary: comparing distinct literal types
otherwise raises TS2367 only for numbered builds. CI artifacts remain test builds;
Vercel deployments continue to use their real metadata.

## D065 — Live screens recover missed broadcasts and sound acknowledges playback

Gendy approved reliable foreground updates, sound diagnosis/recovery and both
collapsible sound cards. Keep identifier-only broadcasts and permission-filtered
RPC reads. Batch notifications within 250 ms without extending the window on each
message. Every watched foreground event checks a small public update token every
4–5 seconds, including while subscribed; unchanged tokens cause no screen refetch.
The token contains current-event ID and event/global audit sequence markers, never
audit contents, private roster information or scores. Failed probes back off to
30 seconds; online/visibility recovery still refreshes immediately. Hidden/offline
tabs skip probes. Current-event changes notify old/new event channels; admin role
changes emit the existing roster signal. Staff profiles refresh on shared revisions.

Request the server's database replication-ready system event before treating a
channel as healthy, including after reconnect. Real integration identified a
previously rejected broker field: Supabase's
[send function](https://github.com/supabase/realtime/blob/master/priv/repo/tenant_schema/realtime/functions/send.sql)
adds a message UUID `id` to the payload. Both thin-signal validators accept that
optional UUID only; outcomes and other unrecognized fields remain rejected.
Browser fixtures include this metadata, and real acceptance waits for the actual
replication stream rather than equating socket subscription with delivery readiness.

Fresh refresh requests bypass stale-first responses while offline cached reads and
initial public snapshots remain supported. EventStore coalesces pending refreshes
with one follow-up; cache notification is for background revalidation, avoiding
fresh-read feedback loops. Setup detects changed server snapshots and preserves
settings/nested-editor/form/sheet drafts behind an explicit refresh notice.
Failed network reads request another refresh even if the token is unchanged;
abandoned read markers expire after 30 seconds. Global audit counts also distinguish
out-of-order commits to independent member records. Owner member/event lists use
fresh reads after creation, deactivation and other completed actions.

Round and selected-team result cues both verify fresh committed occurrences every
two seconds after activation, independently of WebSocket status. Queued cues are
marked heard only after source.start succeeds; cancelled/unavailable cues may retry
within the existing ten-second freshness window. Explicit Test sound uses the same
engine and requires activation; it is a local speaker test even when organizers
disable automatic event cues. It does not mark event history heard. Native details
disclosures keep sound settings compact, retain drafts and leave device actions,
status and errors visible. Consent, mute, one audible event tab, foreground-only
event playback and silent initial/history snapshots remain in effect.
Gendy also requested 4 px more shared label/control and adjacent-card spacing, and
localized inline password length/confirmation/required-field feedback. Reuse the
existing input error/hint/ARIA contract; do not apply new-password length rules to
temporary-password sign-in.

Password inputs share one eye-button implementation with localized show/hide
labels, pressed state and a 44 px minimum touch target. Visibility is local to
each field, starts masked and resets on programmatic value writes; it does not
alter form values, validation, autocomplete or submit the form. Owner create/reset
fields reuse the shared input rather than duplicating password control markup.

Real localhost database-to-WebSocket acceptance supplements browser fixtures in
the existing CI Auth runner. Physical Android/iPhone speaker and venue acceptance
remain separate; a playback API call cannot establish audible hardware output.

## D064 — Team invites register guests once per event and support audited undo

Gendy approved name-required/phone-optional registration through guide-shared team
links, without guest accounts or OTP. Each event/browser uses a random 256-bit
device receipt; only its SHA-256 hash is stored server-side. The database enforces
one registration per event/receipt, including removed registrations. Retries
return the current membership and cannot undo a removal/transfer. Browser storage
is required before submitting; clearing it, staff logout (D047), private browsing
or another device can lose recognition. This is modest abuse prevention, not
verified identity. Same names/phones are allowed and flagged for staff review.

Assigned authenticated guides manage their teams' private rosters and invite
links. Owners/event admins manage all teams; only they pause registration, move
players or preview/remove/restore a link's batch. Guides without login continue
to have links managed by an admin. Signed-in guides select only assigned teams
even before rounds start. Existing ordinary guest selection remains available;
registered guests keep one team and follow server corrections while online.
Membership does not strengthen existing anonymous result-visibility guarantees.
Where available, a browser Web Lock serializes joins across tabs and re-reads the
shared device receipt before submission, avoiding simultaneous fresh identities.

Links use random 256-bit tokens, expire after 30 days and can be replaced/disabled
without removing players. Share URLs put tokens in the fragment to avoid sending
them in navigation/referrer paths. Tokens are accessible only to assigned guides
and event admins through online private RPCs. New joins require a current DRAFT/LIVE
event and open registration; a 30-new-joins-per-link/minute burst limit bounds casual
spam. All writes use RPCs, audits and identifier-only roster signals. No private
roster/token/phone reads or mutations use the offline cache/queue; receipt storage
contains only its secret and non-personal membership metadata. Phones and device
secrets are omitted from audit snapshots and public projections.

Corrections require a reason and an expected version. Soft removal/restoration
preserves history; moves can be corrected with another move. Batch undo previews
exact IDs/versions/names across teams and refuses a changed preview. Batch restore
only affects registrations still removed by that batch, preserving later individual
corrections. Setup team deletion/REPLACE cannot erase invite/registration history
(restricting foreign keys); team edits and UPSERT remain available. Foreground
receipt verification runs on event refresh, online/visibility and every 15 seconds;
offline devices retain their last confirmed state. Physical-device checks remain
separate from automated acceptance.

## D063 — Round cues recover independently of broadcast delivery; explicit Home is public

Gendy reports missing round start/end sounds and silent Home taps for anonymous
visitors. After explicit sound activation, all viewer roles verify committed
round occurrences on ordinary round_changed signals and successful local-write
cache invalidation, as well as dedicated audio broadcasts. A two-second foreground
round-cue check also runs while the socket claims to be subscribed, because a
connected socket alone does not prove delivery. Existing UUID deduplication,
server-time freshness, mute/config switches, silent history and one audible tab
remain enforced. Fresh cues received during MP3 preparation wait for decoding
instead of being discarded. Team result reads remain scoped to the followed team.

The explicit /home route allows visitors without a selected team to render its
existing pick-team prompt; initial root routing and QR confirmations still lead
through team selection. Schedule/detail privacy and staff landing rules remain.

## D062 — CI diagnostic artifacts are best effort

GitHub artifact quota exhaustion must not invalidate passing product checks.
Only the final upload-artifact step uses continue-on-error; formatting, Edge,
unit/browser tests, build, Lighthouse and database checks remain blocking.
Upload failures remain visible in logs. This avoids deleting existing evidence
or changing billing settings to finish a feature verification.

## D061 — Live sound is device-activated and follows committed actions

Gendy requests round start/end sounds for all viewers and win/loss sounds for
followers of the affected team; the draw clarification also requests draw sound.
Plan a master/per-cue event configuration, device Enable sound/mute/volume,
preloaded MP3 assets in `public/sounds/`, identifier-only fresh round cues and
visibility-aware own-team result reads. Never play from an optimistic queued
write, timer expiry or old baseline; deduplicate retries and occurrences.
Browser activation and foreground/network availability constrain immediacy.
Gendy confirms an explicit permission prompt first: Enable sound / Keep muted.
Sound defaults off; decline/dismiss never blocks browsing or repeatedly prompts.
Only the explicit sound action activates playback; retain a later enable/mute
control. This is app consent, not a native browser permission request.
Migration 0028 records enabled round transitions at action time, including backdated
starts, and exposes only fresh occurrences for verification/polling. Match reads
retain only the followed team's outcome through the existing visibility builder.
The immediate stream precedes ordinary refetch debounce; it never carries results.
Device consent unlocks and preloads Web Audio; Web Locks (verified lease fallback)
select one audible tab per event. Initial/reconnected/context-changed snapshots
are silent, corrections sound only for changed outcomes, and foreground mute
cancels all queued/current playback. Clips play at most 4 seconds, with ordered
round cues ahead of results and a 10-second freshness limit. Production and
physical-device rehearsal remain pending; see MEDIA_AUDIO_PLAN.md.
Result occurrences record action time and the then-current sound switches,
independently of the transaction-start audit timestamp; later enablement cannot
replay an outcome recorded while disabled. The venue route remains accessible
when standings are hidden, with its existing reader/template visibility gates
retained, so public attachments and round-only sound do not depend on standings.

## D060 — Custom HEX colours and reusable event swatches

Keep default swatches and add explicit #RRGGBB entry plus named event custom
swatches. Validate/normalise consistently and preserve unknown custom HEX in
XLSX export/import instead of substituting a default palette colour. Removing a
swatch never changes a team's saved colour. Migration 0027 stores up to 32 custom
name/HEX pairs, normalizes input and rejects duplicate names/colours. Configuration
uses a separate audited/idempotent RPC, so palette edits never recalculate scores
or ties. Workbook custom labels include HEX to avoid built-in name ambiguity;
parsing resolves the list back to HEX. The layout/version stays v6, accepting
earlier supported files. Defaults remain built in.

## D059 — Team photos supplement catalog avatars

Gendy authorizes uploadable team pictures, superseding plan §19's exclusion.
Migration 0025 adds optional image_path, public event-scoped Storage and owner/admin
writes. Shared D034 image preparation produces WebP, and the shared avatar falls
back to the catalog when a picture cannot load. Workbook UPSERT preserves omitted
pictures; binary workbook media is excluded. Picture paths are immutable and
retained after replacement/removal: automatic deletion is deferred until cleanup
can account for offline queued metadata retries and avoid deleting referenced
assets. Removing the displayed picture does not revoke a previously shared URL.

## D058 — Opening attachment is public without login or team selection

Gendy confirms images and PDFs. Migration 0026 adds one optional published attachment per
OPENING round, managed by the event owner/admin and projected through public
RPCs. It is available despite hidden standings and without selecting a team;
this is a specific exception to D046's visitor screen scope. Public Storage links
remain readable when merely hidden; deletion is needed to revoke future reads.
The shared shell card sits before route/team-choice/standings gates. Images are
prepared as WebP; PDFs require a PDF header and are capped at 10 MiB. The editor
shows the public-link warning. Immutable objects are retained conservatively as
in D059, including after removing metadata; automatic cleanup remains deferred.

## D057 — SVG hearts and a fixed half-heart draw

Gendy explicitly confirms: a draw always removes half a heart with animation and
sound. LIVES DRAW therefore becomes -0.5, superseding D053's configurable integer
draw gain; POINTS scoring is unchanged. Win/loss gains and whole-heart adjustments
remain configurable as before. Negative hearts remain valid. Use exact half-unit
numeric contracts end-to-end, including standings/ties and XLSX; computed historical
hearts draws will recalculate and affected manual tie orders must be invalidated.
Use red full SVGs in a single row and half-broken SVG for the half remainder/draw;
large counts need a bounded scrollable/virtualised row, not emoji × N.
Implementation started on codex/half-heart-scoring: migration 0024 changes draw
settings, standings, breakdown and tie totals to exact numeric values, and the
shared meter/overlay use SVGs. Template v6 retains v3/v4/v5 compatibility and
normalises old hearts draw gains with a preview warning. Whole starting hearts,
win/loss gains and adjustments stay integers. Runtime acceptance remains pending
cloud verification; audio is a subsequent delivery slice.

## D056 — English terms, staff never pick a team, compact phone rows

The Arabic UI keeps these terms in English: Guide, Round, Game, Match, Team, Event, Referee, Admin, Owner, Break, Station; "ضد" is written "vs" everywhere. Signed-in staff who guide no team never see team selection: `/choose-team`, the header team chip and "Player screen" are hidden and redirect to their own start page. Below 640 px every `ds-data-table` row renders as two short lines (first column plus an end-aligned last column, then the rest with small labels on numeric or normally hidden values); no column is hidden and the schedule's Table/Cards switch appears only from 640 px. ARIA table roles are explicit so the semantics survive the layout change.

## D055 — Quick look for any team or game name

Tapping a team or game name opens a sheet with what matters now: guides (team) or referees (game) with call links, the current match, location and timer, the next match, the last result, and points when the viewer may see outcomes. Visitors only see matches of their own team; members see all. Staff directories come from `get_staff_directory(event)` (migration `0023`), which requires a signed-in member and returns the same guide and referee JSON the public views use. This replaces adding referee/guide columns to every list.

## D054 — One name per item

Events, points names, teams, games, game locations, rounds and member full names have a single field. The app writes it to both language columns (`name_en`/`name_ar`, `location_*`, all five currency forms, `full_name_*`) so older clients and exports keep working; what is typed is what every language shows. Migration `0022` merges existing pairs, preferring the Arabic value and falling back to English, without clearing manual tie orders. The setup workbook v5 has one "points name" row; v3/v4 workbooks are still accepted.

## D053 — Hearts mode: any starting hearts, signed gains

Hearts events start each team with 1–9999 hearts, and win/draw/loss add signed gains (for example 0 / −5 / −10) set in the app and the workbook. Points mode also accepts signed values (−999999…999999). Totals are not floored: hearts may go negative. Existing hearts events become 0 / 0 / −1, which matches the old one-heart-per-loss rule. The team breakdown reports `lives_change` instead of `lives_lost` (migration `0021`).

## D052 — Members edit their own details

Product owner, 2026-10-13. Every signed-in, active member opens "My details" from the
account menu (`/account/profile`) and changes their own username, English and Arabic
names and mobile number. `update_own_profile` (migration `0020`) acts only on the
caller, validates the username format, normalises Egyptian mobiles to `+20…`, refuses
another member's username or mobile, is idempotent per operation id and audits
`MEMBER_PROFILE_UPDATED` with the member as actor. Sign-in keeps working because auth
e-mails are synthetic per member id; the new username or mobile is used from the next
sign-in. Roles, active status and other members stay owner-only.

## D051 — Result entry in a sheet; staff navigation on phones

Product owner, 2026-10-13. Result entry opens in a bottom sheet over the referee station
(and the admin Control sheet) and asks "Who won?" with three equal tiles — team A, draw,
team B — built as a native radio group with team avatars; forfeits stay under "More
options" and Review → Confirm is unchanged. `/ref/match/:id` remains for match details
and bonuses. On phones (below 768 px) the manage section bar and the Import/Export
toolbar are hidden because the bottom bar and More carry the same links; tablets and
desktops keep them (refines D045). Page refresh buttons are a round teal icon button
with an accessible "Refresh" label.

## D050 — Referees keep their match history

"My station" lists the referee's finished matches of ended rounds as read-only history (round, game, each team's outcome; cancelled matches marked). `get_referee_board` returns them with `bucket = 'done'` and `editable = false` for referees (migration `0019`). Only the referee's own games are included, so a hidden leaderboard still hides other games' outcomes; guide phones stay limited to current, upcoming and late matches. Corrections after a round ends remain admin-only.

## D049 — Search on long lists

Product owner requirement 2026-10-13: any list with more than ten values is searchable.
`ds-data-table` shows a search box automatically above tables with more than ten rows
(case-, accent- and Arabic-diacritic-insensitive, every word must match); dropdowns with
more than ten options use `ds-search-select`, which adds a search box to the native select
and keeps the chosen option listed. Setup and owner pickers rebuilt in U7/U8 use the same
components.

## D048 — Phone numbers by audience

Product owner requirement 2026-10-13: phone numbers are shown only to signed-in DST
members, through the role-scoped staff reads of D043. Visitors without a login see only
their own team's DST guide phone, and only while the event's `show_guide_phone` setting is
on (the existing master switch). Referee names stay public (D036) without phones.

## D047 — Logout clears the device

Product owner requirement 2026-10-13: logging out removes everything the app stored on the
device — local and session storage (including the team choice and Supabase session), the
offline IndexedDB database (cached reads and queued operations) and Cache Storage — then
reloads the app so no in-memory copy survives. Only the interface language is kept. When
operations are still waiting to upload, logout first warns that they will be deleted and
asks to confirm. After a forced password change the member returns to the page that asked
for it (or their start page) instead of Home.

## D046 — Visitors see only their own team

Product owner requirement 2026-10-13: a visitor without a login sees only details of the
team chosen on the device. The schedule offers only "My team" (no by-round or by-game
views), other teams' pages and every game page redirect to Home, and team/game names are
plain text instead of links. Signed-in DST members keep full access. Players are
anonymous, so this is a screen rule like the team lock (D035), not a database boundary:
the database cannot know which team a device picked. The leaderboard and the venue display
remain visible to visitors only when the administrators publish them (D027; confirmed by
the product owner 2026-10-13).

## D045 — Manage navigation and Import/Export placement (amends D040)

Product owner decision 2026-10-12/13 (UX plan v3.1, `Claude outputs/BTSApp_UX_Assessment.md`).
The event-administration section bar becomes Control · Results · Adjustments ·
Standings · Setup · Audit, rendered once by a `ManageLayout` route component. The
`live` path stays and is labelled Control. Import and Export leave the section bar
and become permanent, labelled toolbar buttons ("⬆ Import (Excel)", "⬇ Export
(Excel)") on every manage page, plus entries in the staff More sheet, Setup and
Standings. Export becomes one tap: one fresh snapshot is fetched and downloaded
immediately; preview stays available as a secondary action. D040's shared classes
and spacing remain.

## D044 — Signed-in guides and the team lock (amends D035)

A signed-in member holding GUIDE in the current event is set to their guided team
on login, even after the first round started, and may switch only among the teams
they guide. Anonymous devices (including guides without a login) stay locked as in
D035. This remains a client rule; it is not a security boundary.

## D043 — Staff contacts with one-tap call

Event administrators and owners see referee and guide phone numbers; referees see
the guides of the teams at their station and the event administrators; guides see
the event administrators. Phones are returned only by role-scoped staff RPCs and
shown as `tel:` links. Public referee names (D036) never carry phones, exports keep
excluding phones, and guide phones for players stay governed by `show_guide_phone`.

## D042 — Backdated round start

An event administrator may start a round "now" or "X minutes ago" (0–180). The
resulting `started_at` may not precede the latest `closed_at` of another round in
the event. Timers, overtime, the team lock (D035) and the scoring lock (D038) all
key off `started_at` unchanged.

## D041 — Ending a round keeps late results

"End round" (`close_round`) no longer requires every result. Matches still
`SCHEDULED` stay `SCHEDULED` as late results and score 0 (or cost no life) until
entered. Nothing is voided or forfeited automatically; voiding a single match stays
a manual administrator action. The assigned referee may enter the first result of
a late match; corrections in an ended round remain administrator-only. "End & start
next round" is two idempotent operations, end then start. Standings expose a
pending-results count so viewers know results are outstanding. Supersedes the
PENDING_MATCHES close blocker in plan §6.1.

## D040 — One section bar and shared layout for staff screens

Every `/manage/:eventId/*` screen shows the same section bar (Live, Setup,
Standings, Import, Audit log) with `aria-current`, replacing per-page link lists
that ran together. Second-level tabs (setup sections, live rounds, schedule view)
use a teal variant so they never read as the section bar. Shared `ds-card`,
`ds-actions`, `ds-page-header`, `ds-tabs`/`ds-tab` and `ds-button ghost-danger`
classes in `styles.css` give consistent spacing and ≥44 px targets; entity rows
wrap actions below the name on narrow screens. The owner remove-admin control is
now 44×44 px (audit A07). Owner password resets use a localized bottom-sheet form
with masked new/confirm inputs, a 12-character check and cleared values on close,
replacing `window.prompt` (audit A08). No permission or server behavior changed.

## D039 — Schedule table is the default player view

`/schedule` offers Table and Cards views inside each tab (my team, by round, by
game). Table is the default; the choice is remembered per device in
`localStorage bts.schedule.view` and falls back to Table when storage is
unavailable. The table lists round, game, teams and result/status in the same
order as the cards, highlights the active round, and shows breaks as rows. The
result column shows only outcomes the existing visibility rules already return
(own team always; others only when public).

## D038 — LIVES scoring mode

Events have `scoring_mode` (`POINTS` default, or `LIVES`), `initial_lives`
(1–99, required for LIVES) and a free-text `life_emoji` (1–16 characters, default
❤️; the UI suggests ten). In LIVES mode a WIN or DRAW keeps lives and a LOSS or
FORFEIT costs one; VOID and pending matches cost nothing. Lives from matches stop
at zero and a team at zero keeps playing; adjustments add or remove lives and the
total also stops at zero. Standings remain computed (D026): `match_points` holds
lives from matches and `total` the lives left, so ranking, ties, visibility,
export and display reuse the existing contract. Scoring mode and starting lives
cannot change once any round has `started_at` (`SCORING_LOCKED`); the emoji may.
Changing either clears manual tie orders like points changes. The public event
JSON adds the three fields; import workbook v4 adds them to the Event sheet
(blank cells keep current scoring; v3 files remain accepted). Players see their
own lives from their own results even when standings are hidden, which §6.6
already allows. A once-per-match, per-device life-lost animation
(`bts.seenLosses.<eventId>.<team>`) plays on Home/Schedule; the first load on a
device only records existing losses. Reduced motion shows a static card.

## D037 — Breaks are derived from missing matches

Product owner decision 2026-10-12: no general inter-round break entity. In a
regular round, a game without a match is on a break; a team without a match is
resting. Breaks are computed in the client from the existing schedule, never
stored, and need no migration. The opening round lists only its match; unused
stations there are not breaks. Breaks appear on the player schedule (both views),
game details, the setup match builder and the referee board's new round × game
table of the referee's assigned games (event admins without assignments see all
games). That table reads the public schedule, so hidden outcomes stay hidden.

## D036 — Game referee names are public

`get_bootstrap` games include `referees: [{name_en,name_ar}]` for active members
holding REFEREE in the event and an assignment to that game. Names only — no
member IDs, usernames or phones, matching the guide privacy rule. The live
snapshot inherits the field through `get_bootstrap`. Game details and match cards
show "Referee(s): …".

## D035 — Players keep their team after the first round starts

Once any round of the current event has `started_at`, anonymous players and
guides cannot switch team; the header sheet and team picker explain the lock and
QR links for another team are refused. A device that never chose a team may still
pick once. Signed-in owners, that event's administrators and referees are exempt
for operational checks. Team choice is device storage with no server mutation, so
this is a client rule derived from public round data — consistent with the
accepted §6.6 limitation; it is not a security boundary.

## D034 — Prepare game photos before upload

Game setup accepts JPEG, PNG and WebP sources up to 20 MiB and 40 megapixels.
The browser decodes the source, applies its image orientation, preserves aspect
ratio and reduces the longest edge to at most 1024 px without upscaling. Canvas
encodes WebP at quality 0.85; unsupported encoder fallback and outputs exceeding
the existing 5 MiB storage cap are rejected. Source limits bound local resource
use and do not change the storage policy. Preview and upload use only the
converted file. Decode resources and blob previews are released; superseded,
cancelled or destroyed selections cannot replace the current game photo. Save
is blocked during conversion. The existing authorized storage upload path and
database permissions remain in force.

## D033 — Event audit history uses private cursor reads

`get_audit_log(p_event,p_limit,p_before,p_action,p_entity)` permits only an active
owner or that event's administrator. Its first three arguments implement the
planned reader; optional action/entity filters run on the server. Global member
audits are excluded. Actor projections expose names only; event before/after
snapshots remain available to administrators without granting table reads.
Pagination orders by descending audit ID, uses an exclusive bigint cursor and
returns IDs as strings to avoid JavaScript precision loss. Limits are 1–100.
Filter choices come from the authorized event, including outside the current page.
Audit history is read online without persistent browser caching. Context changes,
permission failures and superseding requests hide/discard earlier private reads.
The UI shows Cairo timestamps, localized actor names and safely escaped JSON
snapshots; action/entity codes remain the exact identifiers recorded by the server.

## D032 — Atomic member audits and durable Auth operation recovery

Member creation, edits, login links and activation state use a service-only RPC
that rechecks the active owner actor and writes the row, audit and payload-bound
receipt in one transaction. Member-initiated password changes use a separate
service-only RPC path that requires an active, self-matched actor and atomically
clears the forced-change flag with its audit. Audit failure rolls back that
database mutation. Passwords never enter these RPCs or their receipts.
Edge Functions use the package's bare `@supabase/supabase-js` import; the shared
`supabase/functions/deno.json` maps it to the Deno npm resolver while TypeScript
resolves the installed package.

Auth administration spans an external service and cannot share the database
transaction. Before touching Auth, the Edge handler persists an operation intent
and audit atomically. It appends a completion audit after success. Failed or
ambiguous Auth/link/completion outcomes retain `STARTED` or `NEEDS_REVIEW`, block
another external operation for that member and return HTTP 202 with `ok:false`,
`status:needs_review` and an operation reference. The owner UI shows a review
warning, clears submitted password fields and does not announce success. It never
automatically retries a password write or deletes an uncertain Auth account.
The runbook describes explicit operator reconciliation; successful outcomes are
recorded only after verification. This makes partial completion recoverable but
does not claim distributed atomicity. Apply migrations before deploying handlers.

## D031 — Persisted login deadlines and concurrent admission

The login Edge Function uses service-only database RPCs to reserve an attempt and
record its outcome. Five failures within ten minutes persist a deadline ten minutes
after the fifth completion. Requests during the lock neither authenticate nor
extend it. The deadline survives aging-out history and Edge instance restarts.
An identifier row lock serializes admission and completion; pending attempts
reserve the remaining slots so parallel callers cannot bypass the threshold.
Reservations expire after 60 seconds; an expired or failed completion never
releases credentials. Transient saturation/storage failures return `AUTH_UNAVAILABLE`;
persisted lockouts return `LOCKED_OUT`. Successful attempts do not reset failures
inside the window because the requirement counts failures, not consecutive failures.
Existing applicable locks are backfilled from history during migration `0013`.
No password or token is stored in admission tables or history.

## D030 — Open staff screens belong to one permission context

Route activation guards remain the entry check; a shared session outlet also owns
the lifetime of all owner, manage and referee screens. Losing access removes the
routed component tree and returns to Home. Changing the authenticated user,
member, system role, event roles or assigned games recreates an otherwise allowed
staff screen, discarding local forms and preventing late reads from restoring the
previous screen's DOM. Same-actor token refresh and equivalent profiles preserve
drafts. Public screens retain their existing scoped read-state behavior. Server
RPC/RLS authorization and actor-bound offline operations remain authoritative;
this closes the component-state gap found in audit A01.

## D029 — Readiness installation and enforced bundle budget

Phase 7 installation uses the browser-provided deferred prompt only after an
explicit user gesture. A consumed prompt is never reused; dismissal/errors leave
manual EN/AR guidance available on About. Only `appinstalled` or standalone
launch confirms installation, not prompt acceptance. The shell initializes the
listener so an offer received before About opens is retained. Existing service
worker and IndexedDB behavior remain the offline mechanism; installation does
not promise that every page is cached. Production builds now fail above 500 kB
initial assets instead of allowing the previous 1 MB error ceiling. Real-device
3G timing remains an independent Phase 7 acceptance check.

The agreed implementation plan remains the source of truth. Checked 2026-10-09.

## D001 — Broadcast API verified

[Supabase Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast) confirm `realtime.send(payload jsonb, event text, topic text, is_private boolean)`. Use `false` for `event:<uuid>` public channels. Only identifiers/type are emitted; no outcomes, points, names or row snapshots. Delivery still requires a live Supabase check.

## D002 — Synthetic email: documented, runtime check pending

[Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) supports `email_confirm: true`; [password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) accepts email/password. Preserve `m-<uuid>@members.dst-bts.app`. No SMTP, signup, email confirmation or recovery UI. The exact domain must be tested against GoTrue after project configuration; documentation alone does not prove acceptance.

## D003 — Free limits and capacity assumption

[Pricing](https://supabase.com/pricing) confirms pause after one week, 500 MB database, 1 GB storage, 5 GB egress; [billing](https://supabase.com/docs/guides/platform/billing-on-supabase) lists 200 Realtime peak connections and 2 million messages. The unconfirmed envelope in §7.7 (40 teams, 25 games, 20 rounds, 600 players, 40 staff) remains a capacity assumption, not confirmed attendance. Polling in Phase 5 remains mandatory. A weekly ping is mitigation, not a guarantee against pause.

## D004 — Angular animation and translation

[Angular native animations](https://angular.dev/guide/animations) support `animate.enter`/`animate.leave` since 20.2. No legacy animations package. Use stable Transloco 8 if its npm peer range accepts Angular 21; verify the installed package and production build before claiming compatibility.

## D005 — Hidden results permission conflict

§2.3 and §6.6 explicitly restrict referee access to other teams' hidden outcomes, while §5.2 suggests `can_see_results = public OR is_staff`, which would grant it. Follow the explicit permission matrix: `public OR is_event_admin`. `is_staff` still includes referees for other staff capabilities. No security expansion. Direct domain reads are denied initially; future public reads use visibility-aware RPCs.

## D006 — Environment and hosting

The working repo is `P:/Peter/DST/Badal Talef - Scoring/BTSApp`, branch `phase-0-foundations`; remote scaffold defaults to `master`, not `main`. Workflows cover both branches until the repository default is changed. Pin frontend output explicitly to `dist/btsapp/browser` and confirm it after build. Preview deployments must use a separate Supabase project; no automatic fallback to production. No Supabase/Vercel credentials or Docker executable were present at implementation start. Linking, applying migrations, seeding and hosted acceptance remain pending until those prerequisites exist.

## D007 — Foundation scope

Only migrations 0001–0003 and foundation RPC/helpers are delivered here. Future mutation RPCs must enforce permission, validation, audit, thin broadcast and actor-bound idempotency in the same transaction. Internal `audit`/`emit` are not client-callable. Schema is copied from §5; no standings table or auto-close job. PWA shell setup is included now to permit Phase 0 Lighthouse checks; result flows remain in their assigned phases.

## Verification addendum — 2026-10-09

- **D003 capacity:** Peter confirmed attendance is usually less than the plan's estimates. Retain the envelope for load planning only; no static application limit or schema constraint is based on it.
- **D004 peers:** npm registry `@jsverse/transloco@8.4.0` has `@angular/core >=16.0.0`, `rxjs >=6.0.0`. Installed with Angular runtime 21.2.25, compiled in production and exercised in Arabic/English Chromium tests. CLI/build remain scaffold 21.2.26. Package lock is committed. No fallback translation library needed.
- **D006 output:** production build verified `dist/btsapp/browser/index.html` and `ngsw.json`; initial JS/CSS 314.30 kB. `git ls-remote --symref origin HEAD` confirms `master` is the remote default.
- **D008 PWA acceptance tooling:** [Chrome's Lighthouse documentation](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest) marks PWA auditing deprecated; [the Lighthouse removal issue](https://github.com/GoogleChrome/lighthouse/issues/15535) records category removal in v12. Installed Lighthouse 13.5.0 cannot produce a PWA score. Use manifest/installability, service-worker control and real offline reload checks, retaining accessibility >=90. The literal PWA-score criterion is unavailable; report these equivalent checks separately, never invent a score.
- **D009 measured shell:** Chromium at 360x740 passes EN/AR direction, switching/persistence, no horizontal overflow, >=44px visible controls, modal focus/escape/restoration, zero axe violations and offline navigation. Lighthouse local shell accessibility 100, best practices 100, performance 66 (performance optimization remains Phase 7; hosted results may differ).
- **D010 live verification blockers:** actual `supabase start` returns `DockerLifecycleInspectError`: Docker and Podman absent. No Supabase project ref/credentials, owner passwords or Vercel binding found. SQL files/test suite are written but not yet validated against Supabase; hosted migration, Auth domain, seed, preview separation and Vercel acceptance remain pending.
- **D011 glossary key collision:** agreed keys `team.switch` and `team.switch.confirm` cannot coexist as nested JSON string/object. Keep the glossary's exact dotted keys flat; Transloco resolves them, while new foundation content uses nested objects. Arabic lockout uses Western `10` per section 14.1.

## D012 — Supabase runner verification

[CI run 37869822097](https://github.com/peter-elmasry/BTSApp/actions/runs/37869822097) is green. A real local Supabase stack on GitHub applied/reset migrations 0001–0003 and passed all 155 pgTAP assertions. This supersedes D010's statement that the SQL suite is unexecuted; local Windows Docker and hosted project blockers still apply. A subsequent CI revision adds local owner seed/idempotency and exact synthetic-email domain authentication checks. Hosted configuration/deployment remains separate acceptance.

## D013 — Password provider and mail suppression

The local GoTrue smoke test in CI failed with `Email logins are disabled` when `auth.email.enable_signup=false`. That local flag disables the password provider too. Keep global `auth.enable_signup=false`, enable the email/password provider, and disable confirmation. [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) replaces built-in mail; a stateless Postgres hook returns `EMAIL_DISABLED` for all delivery requests. Only GoTrue can call the hook (besides backend service/admin roles). CI verifies anonymous signup denied, exact synthetic-domain sign-in succeeds, seed reruns preserve IDs/passwords, and password-recovery email denied. Hosted setup must activate this hook in Authentication > Hooks. This implements the agreed no-signup/no-mail model; no new client capability is granted.

## D014 — Other confidence tags

Calculated WCAG contrast for `#FFB800`: 1.73:1 on white, 1.65:1 on ivory, 8.13:1 on navy. This confirms the plan's gold-only-on-navy rule for text. [ExcelJS official releases](https://github.com/exceljs/exceljs/releases) provide its v4.4.0 release history; [SheetJS's official repository](https://github.com/SheetJS/sheetjs) points to a new upstream home. The broad claim that all SheetJS development is unmaintained is not established by these sources. Retain the explicitly mandated ExcelJS choice; browser/import compatibility and security checks belong to Phase 3, before adding it. No XLSX library is added to the Phase 0 bundle.

## D015 — Auth and mail runtime checks passed

[CI run 37870574137](https://github.com/peter-elmasry/BTSApp/actions/runs/37870574137) successfully applies/resets the schema, authenticates both seeded owners at `m-<uuid>@members.dst-bts.app`, verifies their JWTs with `is_owner()`, preserves IDs/passwords across seed reruns, rejects anonymous signup and denies password-recovery mail through the Postgres hook. The expanded SQL suite passes 159 assertions. This verifies the exact synthetic domain against real local GoTrue; hosted owners/secrets/project linking are still pending. Frontend build, five unit tests, three mobile/PWA browser tests and Lighthouse acceptance also pass in the same run.

## D016 — Phase 1 implementation kickoff

The product owner explicitly requested Phase 1 implementation while Phase 0's hosted Supabase/Vercel acceptance remains pending. This starts implementation only; it does not change the recorded Phase 0 acceptance status or permit hosted deployment. Work is on `codex/phase-1-auth-owner`. Phase 1 adds the login/member Edge Functions, profile and owner RPC migration, frontend session/guards, and owner management screens. Local Docker/Supabase and hosted credentials are not available in this workspace, so runtime acceptance still needs to be completed when those dependencies are available.

## D017 — Database test identities and seeded data

PR #3 CI run `38035607700` exposed tests assuming an empty member directory and reading protected tables as `authenticated`. Keep deny-by-default grants unchanged. Count suite-owned fixtures, invoke RPCs with the intended client role, and use the privileged test runner only to inspect persisted state or exercise raw constraints. Phase 2 errors must emit their intended `P0001` code even when optional JSON details are absent; use an empty DETAIL rather than NULL.

## D018 — Storage deletion policy tests emulate API context

Supabase Storage now rejects direct SQL deletes unless `storage.allow_delete_query=true`; the Storage API sets this transaction context automatically ([upstream explanation](https://supabase.com/blog/supabase-storage-performance-security-reliability-updates)). Phase 2 pgTAP tests set it locally around deletion checks of synthetic metadata-only fixtures, assert referee filtering and actual admin deletion, then turn it off. RLS stays enabled, the suite rolls back, and no production migration or Storage safeguard changes.

## D019 — Explicit IPv4 connection for hosted migrations

[Deployment run 38041380671](https://github.com/peter-elmasry/BTSApp/actions/runs/38041380671) links successfully but `db push` fails with `IPv6 is not supported on your current network`, before applying migrations or deploying Edge Functions. [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres) identifies the shared Session pooler on port 5432 as IPv4-compatible. Keep project linking and use `db push --db-url` with a new production environment secret `SUPABASE_DB_URL` containing that project's completed Session pooler URI. Never commit the URI or password. This corrects the deployment transport only; no schema, RLS, business rules or permission changes. Hosted deployment remains unverified until the secret is configured and the updated workflow succeeds.

## D020 — Import shares setup rules and write path

Phase 3 uses the Phase 2 mutation RPCs inside a rollbackable subtransaction. Dry-run exercises the real write path and rolls back rows, audits, broadcasts and operation records; any row failure rolls back all rows. Successful apply records an actor/event-bound operation result for retries. PostgreSQL sequence gaps after rollback are expected. UPSERT retains omitted setup rows, referee game assignments, game images and team sort order. REPLACE preserves EVENT_ADMIN roles and requires event/round draft state plus no round started_at. The workbook may assign only REFEREE/GUIDE, never owners/admins or new accounts.

## D021 — ExcelJS browser integration and dependency review

Use the plan's ExcelJS 4.4.0 through a dynamic default import: its browser bundle is CommonJS, so named imports worked in Node tests but failed in the production browser. ExcelJS is a separate lazy chunk; no initial-bundle exemption is needed. Reject formulas and non-scalar cells; accept only XLSX up to 5 MiB, with sheet row/column limits after parsing. Keep pure template/parser functions behind a small injectable wrapper for Angular TestBed mocks.

The local dependency audit reports two moderate findings through ExcelJS's uuid dependency (GHSA-w5hq-g745-h8pq, missing buffer bounds checks in UUID v3/v5/v6). Inspection of installed ExcelJS source finds only UUID v4 calls without caller buffers. This scopes the identified path but does not claim a clean audit. The browser distribution embeds its dependencies, so an npm override alone would not repair that copy; retain the mandated library and track the upstream advisory rather than force npm's suggested major downgrade. Production builds report the expected CommonJS optimization warning.

## D022 — Vercel asset header uses a non-capturing extension group

Vercel rejected the hashed-asset header source because its custom parameter pattern contained the capturing group `(js|css)`. Use `(?:js|css)` inside the existing `:file(...)` parameter. This preserves the exact asset selection and one-year immutable cache policy required by §15; HTML and service-worker files retain `no-cache`. Vercel's [routing utilities](https://github.com/vercel/vercel/tree/main/packages/routing-utils) use path-to-regexp to parse these sources. Hosted redeployment is a separate verification step; this configuration correction does not change Supabase credentials or application permissions.

## D023 — Public reads expose explicit fields and scoped outcomes

Phase 4 public RPCs use explicit JSON field lists without granting domain-table reads. No current event returns JSON null; unknown event/team parameters raise `NOT_FOUND`. Hidden schedules omit the outcome key entirely for anonymous players, guides and referees, following D005. Team views return only the requested team's outcomes plus non-revoked adjustments with giver names; opponent outcomes remain hidden unless `can_see_results` passes. Anonymous callers can request any team's view, preserving the accepted suspense limitation in §6.6. Guides are shown only while active, with phone omitted unless `show_guide_phone` is enabled. Internal JSON builders are not client-callable.

Team selection is event-scoped, validated against the current roster and written only after confirmation, including QR suggestions. Public schedule responses are discarded on superseding requests or authentication changes; changing identity hides previous privileged outcomes before refetch. The round banner derives overtime from synchronized server time and never changes round state. Standings computation remains in Phase 6 as planned.

## D024 — Live operations are scoped and serialized

Referee operational reads expose outcomes and adjustment history for assigned matches so referees can review and correct their own entries. This narrowly scoped staff contract does not change hidden public schedules or grant access to unassigned matches. Owner/event-admin live reads cover their event; public table grants remain denied.

Live mutations acquire the operation lock before the shared event lock, matching setup/import lock order. They recheck permissions after waiting and validate state before writing. Operation identity binds the actor, RPC, event, entity and canonical JSON payload; exact retries return the stored receipt, including after a round closes, while changed-payload reuse fails. A replay never performs a new write. Reopen preserves the original timer/extensions. Cancelled matches require an admin reset before accepting new results or match adjustments; historical data remains auditable. Timers never close a round.

## D025 — Offline state belongs to the original actor

IndexedDB stores read snapshots by project, RPC arguments, user and permission context. Cached data can render immediately and refresh in the background; permission failures invalidate it, and authentication changes hide prior responses. Staff profile recovery is limited to the same authenticated user on network failure and omits phone information. Cached permissions are for offline navigation only; every replay is authorized by the server.

Domain mutation RPCs persist an operation before sending, retain its UUID across network retries, and preserve FIFO order per actor with transactional cross-tab leases. Acknowledgments are durable; business/permission errors are removed from the pending queue and shown to the user. Other accounts cannot replay an actor's pending work. Storage failure blocks submission instead of claiming it was queued. Member/password Edge Function actions and binary image uploads stay online and are never persisted in the operation queue. Realtime uses identifier-only broadcasts with debounced refetch, visible-tab subscriptions and jittered polling when unavailable.

## D026 — Computed standings and explicit tie resolution

Standings are computed from completed, non-VOID match outcomes using the event's current points configuration, plus non-revoked EVENT adjustments and MATCH adjustments whose match is not VOID. Scheduled MATCH adjustments still count, following the plan's sum of active adjustments. FORFEIT uses loss points and its own counter; it is not also counted as a loss. Zero and negative totals remain visible. Equal totals share competition ranks until an administrator explicitly orders the complete current cohort; no secondary sporting criterion is inferred.

Any scoring configuration, result, match, adjustment or roster write clears all manual positions in that event. Position-only updates and visibility changes preserve them. This conservative invalidation avoids silently applying a previous decision to changed scoring data. Tie operations validate the entire current cohort under the event lock; exact operation replay returns its receipt without reapplying positions cleared since the original write. The specified IDs-only RPC cannot prove a queued draft's original score version if the cohort remains identical; the admin UI discards changed drafts it observes, while server validation always uses the current complete cohort.

## D027 — Visibility and one export snapshot

Hidden standings follow D005: only owners and that event's administrators can read them. Public route guards and read state remove rows immediately when the known visibility or actor context changes; cached team standings, opponent outcomes and result timestamps are redacted as appropriate. No domain-table grants change. Display mode uses the same visibility gate, server-synchronized timer and timestamp-sorted last five visible results; its 20-second cycle can be paused, and reduced-motion preferences suppress rank/count animations.

Export is an online, admin-only, allowlisted STABLE RPC that returns standings, matches, adjustment history, staff and a generated timestamp from one statement snapshot. Preparing an export fetches it fresh, then freezes the exact on-screen preview used by the workbook until returning to live mode. Standings reuse the same SQL builder as the leaderboard; guide phones are omitted even when normal team cards allow them. Workbook columns omit phone numbers, authentication IDs and member IDs. Names and reasons are literal text, totals are numeric cells, and filenames/stamps use Africa/Cairo time. ExcelJS remains lazy-loaded under D021.

## D028 — Gold shared header with navy contrast

Gendy requested a gold header on 2026-10-11, superseding the original navy shared header in §9.3. Use the existing gold background and navy mark/text/control borders; auth actions use navy backgrounds with white text. This preserves the brand palette and navy/gold contrast. Display mode retains its separate navy presentation heading. English/Arabic shell and accessibility checks cover the shared header.

## D029 — Arabic setup workbook v3 is the import contract's front end

The downloadable setup workbook is Arabic-first and right-to-left, is generated from the live event setup, and is the only accepted upload format (`_meta.template_version = 3`). The schedule is a round × game grid: two team cells per game, both empty means that game has a break in that round. Each entity has one name, stored in both `name_en` and `name_ar`; the opening round is set on the event sheet. Teams, games, members and colours are chosen by name from dropdowns and resolved to codes/usernames by the parser, so the server payload and `import_event_setup` are unchanged. Clearing a team or game name removes it from the upload only — UPSERT never deletes; use REPLACE or the setup screens to delete.

## D030 — Owner-set passwords are temporary

Any password an owner sets (create or set_password) marks the member `must_change_password`; the member must choose a new password (≥12 characters, not containing the username) at `/account/password` before staff routes open. Self-service changes go through the `members` Edge Function action `change_own_password`. This accepts that bulk-created accounts use a predictable username-based temporary password until first login.

## D031 — A team may have several guides

The `one_guide_per_team` index is dropped (migration `0011`): any number of guides may be assigned to one team, while a member still guides at most one team per event. Public team JSON keeps `guide` (first guide by name, for older clients) and adds `guides` (all of them); players see every guide. Standings payloads carry neither. This supersedes the Phase 2 criterion "second guide on same team rejected".
