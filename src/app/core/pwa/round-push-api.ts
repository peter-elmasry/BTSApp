import { environment } from '../../../environments/environment';

export const PUSH_DEVICE_KEY = 'bts.round-push';
export interface PushDevice {
  receipt: string;
  event: string;
  publicKey: string;
}
export function readPushDevice(): PushDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(PUSH_DEVICE_KEY) ?? 'null');
    return /^[a-f0-9]{64}$/.test(value?.receipt ?? '') &&
      typeof value?.event === 'string' &&
      typeof value?.publicKey === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
export async function pushRequest(body: Record<string, unknown>): Promise<{ publicKey?: string }> {
  const response = await fetch(
    `${environment.supabaseUrl || 'http://127.0.0.1:54321'}/functions/v1/round-push`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.supabaseAnonKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'PUSH_UNAVAILABLE');
  return result;
}
/** Logout revokes the browser endpoint even if the server is temporarily unreachable. */
export async function revokePushDevice(): Promise<void> {
  const saved = readPushDevice();
  await Promise.allSettled([
    saved ? pushRequest({ action: 'unsubscribe', receipt: saved.receipt }) : Promise.resolve(),
    navigator.serviceWorker?.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager?.getSubscription();
      await subscription?.unsubscribe();
    }),
  ]);
  window.dispatchEvent(new Event('bts:push-revoked'));
}
