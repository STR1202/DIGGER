import type { DiggrMap, Entitlement } from '@diggr/core';
import type { CreateMapRequest, DiggrApi, GenreFacet, SearchHit, SyncPayload } from './types';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 本番の API サーバー（services/api）に対する実装。認証は匿名 JWT（FR-14）。 */
export class HttpApi implements DiggrApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.message ?? `request failed: ${res.status}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async search(query: string): Promise<SearchHit[]> {
    const r = await this.request<{ items: SearchHit[] }>(
      `/search?q=${encodeURIComponent(query)}`,
    );
    return r.items;
  }

  createMap(req: CreateMapRequest): Promise<DiggrMap> {
    return this.request<DiggrMap>('/maps', { method: 'POST', body: JSON.stringify(req) });
  }

  getMap(mapId: string): Promise<DiggrMap> {
    return this.request<DiggrMap>(`/maps/${mapId}`);
  }

  reroll(mapId: string): Promise<DiggrMap> {
    return this.request<DiggrMap>(`/maps/${mapId}/reroll`, { method: 'POST' });
  }

  entitlement(): Promise<Entitlement> {
    return this.request<Entitlement>('/entitlements');
  }

  claimReward(): Promise<Entitlement> {
    return this.request<Entitlement>('/entitlements/reward', { method: 'POST' });
  }

  async markListened(mbid: string): Promise<void> {
    await this.request<void>('/me/listened', {
      method: 'POST',
      body: JSON.stringify({ mbid }),
    });
  }

  async genreFacets(mapId: string): Promise<GenreFacet[]> {
    const r = await this.request<{ items: GenreFacet[] }>(`/maps/${mapId}/genres`);
    return r.items;
  }

  sync(pending: SyncPayload): Promise<{ accepted: number }> {
    return this.request<{ accepted: number }>('/me/sync', { method: 'POST', body: JSON.stringify(pending) });
  }

  async deleteAccount(): Promise<void> {
    await this.request<void>('/me', { method: 'DELETE' });
  }
}
