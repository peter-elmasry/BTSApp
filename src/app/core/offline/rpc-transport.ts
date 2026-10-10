import { inject, Injectable } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

import { actorIdentity, rpcFailure } from './rpc-errors';

@Injectable({ providedIn: 'root' })
export class RpcTransport {
  private readonly auth = inject(AuthStore);
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const bearer =
      (this.auth.session()?.access_token ?? environment.supabaseAnonKey) || 'missing-anon-key';
    return this.request<T>(name, args, bearer);
  }
  async mutate<T>(name: string, args: Record<string, unknown>, actor: string): Promise<T> {
    const session = this.auth.session();
    if (
      !session ||
      actorIdentity(session.user.id, this.auth.profile()?.id, environment.supabaseUrl) !== actor
    )
      throw { code: 'ACTOR_CHANGED' };
    return this.request<T>(name, args, session.access_token);
  }
  private async request<T>(
    name: string,
    args: Record<string, unknown>,
    bearer: string,
  ): Promise<T> {
    // A captured bearer prevents an identity switch from changing an in-flight read or mutation.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        `${environment.supabaseUrl || 'http://127.0.0.1:54321'}/rest/v1/rpc/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: environment.supabaseAnonKey || 'missing-anon-key',
            Authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        },
      );
      const data: unknown =
        response.status === 204
          ? null
          : await response.json().catch(() => {
              if (response.ok) throw new TypeError('Failed to fetch complete response');
              return null;
            });
      if (!response.ok)
        throw {
          ...rpcFailure(data),
          status: response.status,
          message: rpcFailure(data).message ?? response.statusText,
        };
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
