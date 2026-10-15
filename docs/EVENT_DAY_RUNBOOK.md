# Event-day runbook

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

The hearts/media/audio extensions in implementation plan §22 are planned, not
deployed. Once implemented, add rehearsal checks for exact half-heart draws,
public opening image/PDF access without login/team selection, team photos and
custom HEX workbook round trips. Put the five clips listed in MEDIA_AUDIO_PLAN.md
under `public/sounds/`; enable sound and test each cue on the venue display and
actual Android/iPhone devices before play. Verify winning, losing and drawing
team devices separately, mute, reconnect and duplicate suppression. Browser
activation is required and network/background restrictions limit immediacy.

Record deployed commit, production URL, device/browser, network profile, date and
outcome in `PROGRESS_LOG.md`. Required: initial bundle below 500 kB, measured
3G first load below 4 seconds on the agreed mid-range Android profile, EN/AR
mobile accessibility/reduced-motion review, installability/offline/reconnect,
QR scans, result celebrations and the full database permission suite. Local
mocked browser tests do not replace hosted acceptance or real-device timing.
