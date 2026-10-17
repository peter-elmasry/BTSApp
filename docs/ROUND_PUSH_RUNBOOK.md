# Background round notifications (D069)

The production Supabase deployment applies migration 0031, deploys `round-push`
with gateway JWT verification disabled (its dispatch route validates a private
secret), and runs `scripts/configure-round-push.mjs`. The helper uses the existing
deployment access token/project reference to obtain its service credential in
memory. It creates the VAPID identity once and retains it on subsequent releases.
No extra paid provider or frontend secret is required. Runtime private keys and
dispatch secret live in the `round_push_runtime` Vault secret, never in Git/logs.
The deployment management token must permit revealing project API key secrets;
an explicitly supplied `SUPABASE_SERVICE_ROLE_KEY` is the alternative. The helper
requests `reveal=true` in memory and never prints the credential response.

Keep `net` out of Data API exposed schemas. Supabase owns pg_net's grants and
does not support revoking them per project. Provisioning fails closed unless an
explicit `Accept-Profile: net` API request is rejected with PGRST106; CI repeats
that check using the anonymous key. Trusted database login roles can read queued
HTTP headers. See the [Supabase platform constraint](https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16).

The production workflow's `PUSH_APP_ORIGIN` variable defaults to the verified
production host, `https://dst-scoring.vercel.app`. Set that variable when moving
domains. For a separate project, supply `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
and `PUSH_APP_ORIGIN` to the same script; never point a preview at production.
An optional `PUSH_VAPID_SUBJECT` accepts a contact mailto URL. Do not rotate or
delete the Vault secret casually: existing browser endpoints use its VAPID key.

`round_push_committed` queues only fresh start/close actions for unexpired devices
following the current event. The queue commits/rolls back with the round. pg_net
wakes the function after commit; `round-push-retry` runs every minute to recover
missed requests. The worker claims up to 100 deliveries with 90-second leases,
sends at most ten concurrently with five-second provider timeouts, and retries
transient failures up to four attempts within two minutes. Busy events can require
several invocations; freshness takes precedence over late delivery. Success is
provider acceptance, not proof that a phone displayed or sounded the alert.
404/410 removes expired endpoints; other permanent 4xx stops that delivery.

Subscription registration is idempotent by a private 256-bit browser receipt and
cannot take over another receipt's endpoint. No direct anonymous/authenticated
table or internal-RPC access is granted. Anonymous device registration has a
salted IP counter (6,000 requests/hour to accommodate shared venue Wi-Fi), a
20,000-device ceiling and 90-day expiry. Raw IPs are not retained. One test per
minute per device; revocation is never blocked by the shared IP counter. Ordinary
push is suppressed if an app window is visible; test push always displays.
Logout revokes the server subscription and browser endpoint before clearing
device storage. Unreachable server cleanup is best effort; local unsubscribe
invalidates delivery and expired provider endpoints are removed on send.

Acceptance after merge/deployment:

1. Confirm the Supabase deployment workflow and Vercel production release succeed.
   Open Background notifications under the sound card. It must show an enable
   action, without an automatic permission prompt. Enable explicitly; verify a
   successful server acknowledgment and use Send test notification.
2. Test Android Chrome and an installed iPhone/iPad Home Screen app. Grant phone
   notifications, close/background the app, then start/close a designated test
   round. Verify actual arrival, tap-to-Home behavior, and phone sound settings.
   Use a test event/project; do not alter live match results for acceptance.
3. With the app visible, verify ordinary push is suppressed and existing round
   MP3 behavior remains. The test notification must still display. Disable,
   reload and logout: no further notifications should arrive for that endpoint.
4. Check event change, denied/dismissed permission, offline failure/retry, expired
   subscription, iOS installation guidance and EN/AR narrow layouts. Confirm no
   results, player names, phone numbers or endpoint/secret values appear publicly.

Inspect aggregate counts in `round_push_deliveries`, pg_cron run history and
`ROUND_PUSH_WAKE_FAILED`/`ROUND_PUSH_QUEUE_FAILED` warnings using privileged tools.
Do not paste subscription rows, HTTP request headers or Vault values into logs.
To pause dispatch, unschedule `round-push-retry` **and** temporarily remove the
Vault runtime configuration; the round trigger otherwise wakes immediate delivery.
Keep the VAPID identity securely backed up before changes.

Implementation references: [Angular push](https://angular.dev/ecosystem/service-workers/push-notifications),
[Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Web Push sender](https://github.com/web-push-libs/web-push), and
[WebKit iOS/iPadOS Web Push](https://webkit.org/blog/13878/).

Administrators can open Event sound and choose **Test with others** beside the
local Test sound action. This targets the current DRAFT/LIVE event, with a shared
one-minute server cooldown and no round/result changes. Open apps show a localized
test message, including muted guests; MP3 playback still respects device consent,
organizer master sound and tab ownership. Enabled devices receive an explicitly
labeled test push, including while visible (the existing test behavior). Queued
device count is not proof of receipt. The online-only idempotent RPC is
`test_event_notifications`; `get_notification_test` exposes only fresh occurrence
and timestamp, with existing recovery probes covering missed realtime delivery.
Test with synthetic subscribers/clients before sending a real group test; deployment
verification must not itself broadcast to production users.
