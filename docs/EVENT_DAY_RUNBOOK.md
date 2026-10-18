# Event-day runbook

### Member appointments (D076; implementation branch, release pending)

After explicit release authorization, deploy migration 0037 and the matching
frontend together through the normal workflows. This module is independent of
the active sports event and does not alter teams, rounds or scores.

1. Owner: account menu → Manage appointments → Create session. Set the booking
   window, Cairo/default IANA timezone, location/optional HTTPS link and cancellation
   cutoff. Save a draft. Assigned interviewers need active accounts and completed
   password setup.
2. Add slots with an interviewer and start/end range, duration and optional break;
   review the complete preview before confirming. Manual single slots support
   exceptions. Publish only after checking the schedule. Conflicting interviewer
   times are rejected across sessions; different interviewers may run in parallel.
3. Member: Appointments → session → confirm name → select slot → Review → Confirm.
   My bookings supports cancellation and atomic rescheduling before the cutoff.
   A confirmation toast means the server reserved it; offline actions are not queued.
4. Interviewer: My interviews shows assigned attendees and links to assigned sessions
   with their free/booked slots. Mark completed/no-show only after the slot starts.
   Other members never receive attendee names. Owners manage all bookings.
5. If a response is lost, keep the page open and use Check status / retry. It reuses
   the same operation UUID and checks the receipt before resubmitting. Check My
   bookings after an accidental reload before making a new reservation. Do not
   interpret a timeout or stale availability as a confirmed booking.
6. Occupied slots and booked location/link/timezone cannot silently move. Explicitly
   cancel before changing those details; history remains. Closing stops new bookings;
   cancelling a session permanently cancels outstanding bookings and retains history.
   Owner rescheduling still requires an open published booking window.

Acceptance: verify migration/reset and pgTAP, real concurrent reservations in the
localhost-only Auth harness, EN/AR mobile booking/rescheduling/cancellation,
interviewer privacy/attendance, owner preview/publish, ambiguous response recovery,
and access with no current event/team. Physical device rehearsal remains separate.

**Production release verified 2026-10-16:** PR #33 is merged as `743e7b1`.
Master [CI 38814241798](https://github.com/peter-elmasry/BTSApp/actions/runs/38814241798)
and [Supabase deployment 38814241643](https://github.com/peter-elmasry/BTSApp/actions/runs/38814241643)
passed. Deployment logs confirm migration `0029_team_registration.sql` applied
and login/members Edge Functions deployed. Vercel reports success for the same
commit. Read-only mobile Chromium smoke checks on the public production domain
passed in EN/AR: 12 teams render, invalid invite links are rejected, anonymous
roster execution is denied, and no page errors or horizontal overflow occur.
Physical-device and venue acceptance remain pending.

### Realtime and sound recovery (D065)

After deploying migration 0030 and its matching frontend, verify a result entered
on one device appears on a second foreground device without Refresh. Healthy
broadcast delivery targets two seconds; recovery from a silently missed broadcast
targets seven seconds on the test network. Recovery checks use a small update token,
not repeated full score downloads. Offline/hidden devices resume when connected and
visible; network failures back off. Setup shows changes available rather than
replacing unsaved settings or editor drafts.

Expand **Event sound** to adjust volume or use **Test sound**. The test plays on
this device after activation, even when automatic event sounds are disabled by the
organizer. Confirm audible output, then test actual round start/end and selected-team
win/loss/draw events from another device. After a reload or browser interruption,
use Enable sound when asked. Collapsing either sound card does not mute playback
or discard settings. Local browser/API tests do not replace checking actual speakers.

### Player invite registration (D064)

- In the account menu, open **Players & invite links**. Guides see assigned teams;
  owners/event admins see the current event's teams. Guide records without login
  need an admin to manage/share their links.
- Create a team link and use Share / copy. Players enter a name and optional phone;
  their browser remembers one registration for the event. Another browser/device,
  cleared storage or staff logout can lose recognition; matching names/phones are
  only review hints, not verified identities.
- Replace/disable an exposed link to stop its future use. This preserves registered
  players. Event admins can pause all new joins. Links expire after 30 days and
  join only the current DRAFT/LIVE event.
- Correct names/phones, Remove or Restore in the roster; admins can Move to team.
  Enter a reason. After a conflict, refresh before retrying. Devices follow confirmed
  corrections online (foreground verification within about 15 seconds).
- For a mistakenly shared link, admins use Preview undo, inspect affected players
  (including transfers), enter a reason and confirm. Disable the link separately
  if needed. Restore removed batch reverses that removal while preserving later
  individual corrections. All operations require an online server confirmation.
- Existing invites/registrations prevent destructive team deletion/setup REPLACE.
  Use edits/UPSERT for established teams. Rehearse name-only join, link replacement,
  correction and restoration on a spare device before sharing event links.

Readiness is pending until the hosted checks below pass. Phase 7 is in progress;
celebrations, printable team QR sheets and the measured 3G load target are not yet
accepted. Phase 0 hosted acceptance remains separate.

## The day before

1. Confirm the intended commit is deployed to the production URL and all CI jobs
   pass, including the database permission suite. Check the Supabase deployment
   workflow independently of the frontend deployment. Do not assume a green
   frontend means migrations or Edge Functions were deployed.
2. Confirm the production Supabase project is awake and reachable. Check the
   keepalive workflow; perform an actual app read even if its latest run passed.
3. Sign in as an owner and verify the intended current event, names, points,
   currency, caps and leaderboard visibility. Confirm teams, games, opening
   match, round durations, schedule and referee/game assignments. Confirm guides
   and the guide-phone visibility choice.
4. Use a separate preview project/event to rehearse: choose team, referee result,
   correction, opening winners, adjustment/revocation, overtime, close/reopen,
   standings, tie resolution and XLSX export. Do not seed rehearsal results into
   the live event. Confirm an unassigned referee cannot score another game.
5. On an actual Android phone and iPhone, open the production URL online. Use
   About for installation instructions. Open the chosen team and schedule, then
   check offline reload and reconnect. Installation alone does not cache every
   screen. Test the venue network/hotspot and a backup connection.
6. Verify printed team links point to the production origin and suggest the
   correct team through `/?team=T01`; confirmation is still required. Printable
   QR generation is a remaining Phase 7 deliverable.
7. Verify owner access and staff logins privately. Owners can reset staff
   passwords; email recovery is disabled. Keep credentials and secret values out
   of screenshots, exports, chat and repository documents.

## Vercel author-access blocks

**Recovery verified 2026-10-15:** PR #30 preview and production deployment of master
9b4d75e succeeded. The public site is https://dst-scoring.vercel.app; anonymous
home/display routes and all five sound files are reachable there. Deployment-specific
URLs can still require Vercel sign-in, so use the public domain for player checks.
Production Supabase workflow 38765043986 applied migrations 0024–0028 and deployed
login/members. The earlier diagnosis below is retained for future access incidents.

On 2026-10-15, PRs #24–#29 have green frontend/database checks but failed Vercel
deployment statuses. Vercel identifies commit author `Gendyadel` as lacking access
to the `peter-elmasry's projects` team that owns `bts-app`. PR #27 provides only
the generic blocked status; the common author/team makes the same cause likely.
This is an account-level blocker; a passing GitHub build does not verify hosting.

The project owner should verify the team's actual plan and membership in Vercel:

1. For private-repository collaboration, use a Pro team, add/approve Gendyadel
   with deployment access, and ensure their Vercel account's Login Connections
   links the correct GitHub account. If already a member, repair that connection.
2. Hobby private repositories require the commit author to be the owning account.
   A sole-deployer workflow must use the owner's genuine commits; changing another
   contributor's attribution is not a membership fix. Public-repository
   collaboration is another option, but changing visibility requires an explicit
   repository-owner decision.
3. After correcting access, redeploy the affected preview commits and check each
   Vercel status and build log. Existing blocked checks are not proof of a fresh
   build. Confirm Preview uses the separate Supabase project before rehearsal.

Do not change billing, repository visibility, commit identity or required checks
as an incidental deployment workaround. See Vercel's
[project collaboration troubleshooting](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).
The team plan/membership and a successful hosted build remain unverified.

## Before the first round

- Charge staff devices and backup power. Open the correct staff account and event
  while online; verify assigned matches appear.
- Check no device has pending uploads or unresolved failure messages. A queued
  operation is saved on that device, not yet accepted by the server.
- Confirm scoring/currency and caps with referees. Changing scoring recomputes
  old results and clears manual tie orders. Decide when standings will be public.
- Open `/display` on the venue screen if standings are public, or use an authorized
  administrator session. Avoid exposing a staff session on a shared device.
- Start the intended round through the administrator Live screen. Confirm referee
  boards and player timers update before play begins.

## During play

- Referees submit and confirm assigned results; check the pending-upload indicator
  clears. Correct mistakes through the same match entry. Administrators can
  correct any match and review adjustment giver/reason/history.
- Overtime does not close a round. Extend it when needed. End round may leave
  pending matches as late results; never cancel or forfeit them just to end it.
  Assigned referees may enter their first late result; closed-round corrections
  require an administrator. Cancelled matches must be reset before scoring again.
- If connectivity fails, keep the same staff account and device. Leave the app's
  saved data intact; reconnect and use Retry uploads. Do not clear browser storage,
  uninstall, or switch accounts to fix a pending upload.
- A server permission/validation failure needs review; automatic retry cannot
  override it. Check assignment, round state and caps, then submit the corrected
  action. If unsure whether a lost acknowledgment applied, reconnect and inspect
  the match before entering a replacement on another device.
- If realtime stalls, check the connection and wait for polling. Compare the
  last-updated indicator with a connected staff device. Cached data may be stale.

## Closing and results

1. Confirm pending uploads are zero on every scoring device and all results are
   accepted. Reconcile disputed results and revoked adjustments.
2. Close the final round. Review computed standings and resolve complete tied
   groups if required. Further scoring/roster changes invalidate manual ordering.
3. Prepare a fresh export from the Standings administration screen. The preview
   freezes the snapshot used by the workbook; return to live mode and prepare
   again after changes. Check its Cairo timestamp and totals before sharing.
4. Publish standings when approved by the event team. Check them anonymously on
   a player device and on `/display`. Pause the display cycle if needed.
5. Save the final workbook in the event team's approved location. Sign staff out
   of shared devices after pending operations have synchronized.

## Escalation and recovery

- Owner: member activation/password resets, event selection and admin assignment.
- Event administrator: schedule, lifecycle, scoring corrections, adjustments,
  visibility and tie resolution. Preserve audit history; do not edit database
  rows directly as an event-day workaround.
- Deployment maintainer: inspect failed GitHub/Vercel/Supabase jobs and project
  availability. Production secrets belong in the configured environment/secret
  stores; record names and failure codes only. Deployment or rollback requires
  separate authorization; this runbook does not grant it.
- Record incident time in Africa/Cairo, event/round/match identifiers, visible
  error code, affected devices and recovery outcome. Exclude credentials and
  private contact data.

## Member operation needs review

If the owner screen shows an operation reference, record that reference and stop
repeating the member/password action. An Auth change may have applied even if
its completion could not be recorded. The original audit intent is retained;
the operation is blocked from automatic replay.

A deployment maintainer with authorized service/operator access should:

1. Inspect `member_admin_operations` for the reference or `STARTED`/`NEEDS_REVIEW`
   rows. Read member/action/status/Auth ID/reason/time; never copy credentials into
   an incident record.
2. Compare the member row with the Auth account, using its recorded Auth ID or
   the deterministic synthetic email `m-<member_id>@members.dst-bts.app` if the
   process stopped before recording the Auth ID. Verify account existence, member
   link and active/ban state. Do not infer a password change from account metadata.
3. Where necessary and authorized, repair links/activation through
   `member_admin_write`, with an active owner's Auth UUID and a fresh operation
   UUID. This preserves atomic database audits; avoid direct row edits.
4. Use service-only `member_admin_finish` with `SUCCEEDED` only for a verified
   outcome. If the intended outcome cannot be confirmed, coordinate recovery with
   the owner, close the old operation as `FAILED` with `OPERATOR_RECONCILED`, and
   obtain an explicit new password reset if needed. Never automatically replay
   or guess an old password. Finishing appends an audit atomically; if it fails,
   leave the pending operation for retry after database recovery.

Reconciliation is an operator procedure until an owner recovery UI is implemented.

## Acceptance record before release

Owners can open the account/More menu to check Release R<PR number>, short commit
and deployment environment. Compare the number with the PR being released and
confirm Production; Preview is a test build. The row identifies the frontend
currently loaded. After a successful deployment, reload/reopen the app if it still
shows the previous release. Do not infer database/Edge deployment from this row.
Builds without PR metadata show the short revision; match that to the deployed
commit. The release row is hidden from all non-owner roles and guests.

The hearts/media/audio extensions in implementation plan §22 and registration in
§23 are merged and deployed through production commit `743e7b1`.
Physical-device rehearsal remains pending. Rehearse exact half-heart draws,
public opening image/PDF access without login/team selection, team photos and
custom HEX workbook round trips. The supplied clips live in `public/sounds/`:
`round-start.mp3`, `round-end.mp3`, `match-win.mp3`, `match-loss.mp3` and `match-draw.mp3`.
Replace those files and rebuild/redeploy to change audio. Each clip plays for up
to four seconds; announcements take priority over team results. In Setup -> Settings,
set the event master/per-cue switches. Each device first chooses Enable sound or
Keep muted; a saved preference never bypasses browser activation after reload.
Enable sound and test each cue on the venue display and
actual Android/iPhone devices before play. Verify winning, losing and drawing
team devices separately, mute, reconnect and duplicate suppression. Browser
activation is required and network/background restrictions limit immediacy.

Record deployed commit, production URL, device/browser, network profile, date and
outcome in `PROGRESS_LOG.md`. Required: initial bundle below 500 kB, measured
3G first load below 4 seconds on the agreed mid-range Android profile, EN/AR
mobile accessibility/reduced-motion review, installability/offline/reconnect,
QR scans, result celebrations and the full database permission suite. Local
mocked browser tests do not replace hosted acceptance or real-device timing.
