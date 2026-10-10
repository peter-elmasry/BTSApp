export interface RpcFailure {
  code?: string;
  message?: string;
  details?: unknown;
  hint?: string;
  status?: number;
  name?: string;
}
export function rpcFailure(error: unknown): RpcFailure {
  return error && typeof error === 'object' ? (error as RpcFailure) : { message: String(error) };
}
export function isNetworkFailure(error: unknown): boolean {
  const failure = rpcFailure(error);
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (
    failure.status &&
    failure.status >= 500 &&
    (!failure.code || /^PGRST00[0-3]$|^57P0[1-3]$|^5\d\d$/.test(failure.code))
  )
    return true;
  if (failure.code || (failure.status && failure.status < 500)) return false;
  return (
    error instanceof TypeError ||
    (failure.status !== undefined && failure.status >= 500) ||
    /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out|aborterror/i.test(
      `${failure.name ?? ''} ${failure.message ?? ''} ${String(failure.details ?? '')}`,
    )
  );
}
export function retryDelay(attempt: number): number {
  return Math.min(60000, 2000 * 2 ** Math.min(attempt, 5));
}
export function actorIdentity(
  userId: string | null | undefined,
  memberId: string | null | undefined,
  project = '',
): string | null {
  return userId && memberId ? JSON.stringify([project, userId, memberId]) : null;
}
