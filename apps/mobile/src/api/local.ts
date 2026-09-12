import {
  buildMap, expandMap, FREE_ENTITLEMENT, MockRepository, newRandomSeed, PRO_ENTITLEMENT,
  ancestors, depth as genreDepth, resolveViewType,
  type DiggrMap, type Entitlement, type Plan,
} from '@diggr/core';
import type { CreateMapRequest, DiggrApi, GenreFacet, SearchHit, SyncPayload } from './types';

/**
 * サーバーなしで動かすための実装。
 * 端末内で @diggr/core を直接呼ぶだけで、HTTP 実装と同じ振る舞いをする。
 * 開発・レビュー・オフラインデモ用（EXPO_PUBLIC_API_MODE=local）。
 */
export class LocalApi implements DiggrApi {
  private readonly repo = new MockRepository();
  private readonly maps = new Map<string, DiggrMap>();
  private plan: Plan = 'free';
  private rewardUntil = 0;
  private seq = 0;

  setPlan(plan: Plan): void { this.plan = plan; }

  private newId(): string {
    this.seq += 1;
    return `01J${Date.now().toString(36).toUpperCase()}${String(this.seq).padStart(3, '0')}`;
  }

  async entitlement(): Promise<Entitlement> {
    const pro = this.plan !== 'free' || Date.now() < this.rewardUntil;
    if (!pro) return FREE_ENTITLEMENT;
    return {
      plan: this.plan === 'free' ? 'pro_monthly' : this.plan,
      ...PRO_ENTITLEMENT,
      expiresAt: this.plan === 'free' ? new Date(this.rewardUntil).toISOString() : null,
    };
  }

  async claimReward(): Promise<Entitlement> {
    this.rewardUntil = Date.now() + 30 * 60 * 1000;
    return this.entitlement();
  }

  async search(query: string): Promise<SearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const index = await this.repo.genreIndex();
    const artists = await this.repo.searchArtists(q, 12);
    const genres = await this.repo.searchGenres(q, 6);
    return [
      ...artists.map((a): SearchHit => ({
        type: 'artist', key: a.mbid, name: a.name,
        subtitle: `${a.country ?? ''} ${a.beginYear ?? ''} · ${a.genres
          .slice(0, 2)
          .map((g) => index.get(g)?.name ?? g)
          .join(' / ')}`,
      })),
      ...genres.map((g): SearchHit => ({
        type: 'genre', key: g.id, name: g.name,
        subtitle: `第${genreDepth(index, g.id)}階層 · このジャンルに ${g.count} 組`,
      })),
    ];
  }

  async createMap(req: CreateMapRequest): Promise<DiggrMap> {
    const ent = await this.entitlement();
    const index = await this.repo.genreIndex();
    const seedArtist = req.seedType === 'artist' ? await this.repo.getArtist(req.seedKey) : null;
    const seedGenre = req.seedType === 'genre' ? index.get(req.seedKey) : null;
    if (!seedArtist && !seedGenre) throw new Error(`seed not found: ${req.seedKey}`);

    // FR-01（v3.2 二層化）: グラフの無いアーティストを「関連アーティスト」で掘ろうとした場合は、
    // 断らずに黙ってジャンル地図（そのアーティストの主ジャンル起点）へ切り替える。
    const seedHasGraph = seedArtist ? seedArtist.hasGraph : true;
    const viewType = resolveViewType(req.viewType, req.seedType, seedHasGraph);
    const genreId = viewType === 'genre'
      ? (req.genreId ?? (seedGenre ? seedGenre.id : seedArtist!.genres[0]!))
      : null;

    const similar = viewType === 'related'
      ? await this.repo.similarTo(req.seedKey, 1000)
      : undefined;
    const members = viewType === 'genre' && genreId
      ? (await this.repo.genreMembers(genreId, 1000)).filter((a) => a.mbid !== req.seedKey)
      : undefined;
    const known = viewType === 'genre' && seedArtist && seedHasGraph
      ? new Set((await this.repo.similarTo(seedArtist.mbid, ent.nodeLimit)).map((r) => r.artist.mbid))
      : undefined;

    const map = buildMap({
      mapId: this.newId(),
      seedType: req.seedType,
      seedKey: req.seedKey,
      seedName: seedArtist?.name ?? seedGenre!.name,
      viewType,
      genreId,
      entitlement: ent,
      randomOn: req.randomOn,
      randomSeed: newRandomSeed(),
      parentMapId: req.parentMapId ?? null,
      schemaVersion: this.repo.schemaVersion(),
      seedHasGraph,
      ...(similar ? { similar } : {}),
      ...(members ? { members } : {}),
      ...(known ? { knownMbids: known } : {}),
      genreIndex: index,
    });
    this.maps.set(map.id, map);
    return map;
  }

  async getMap(mapId: string): Promise<DiggrMap> {
    const m = this.maps.get(mapId);
    if (!m) throw new Error(`map not found: ${mapId}`);
    // 権利が変わっていたら、引き直さずに広げる（UC-02）
    const ent = await this.entitlement();
    if (ent.nodeLimit > m.nodes.length && m.nodes.length < ent.nodeLimit) {
      const fresh = await this.createMap({
        seedType: m.seedType, seedKey: m.seedKey, viewType: m.viewType,
        genreId: m.genreId, randomOn: m.randomOn, parentMapId: m.parentMapId,
      });
      const merged = expandMap(m, fresh);
      this.maps.delete(fresh.id);
      this.maps.set(merged.id, merged);
      return merged;
    }
    return m;
  }

  async reroll(mapId: string): Promise<DiggrMap> {
    const m = this.maps.get(mapId);
    if (!m) throw new Error(`map not found: ${mapId}`);
    if (!m.canReroll) throw new Error('reroll not available');
    return this.createMap({
      seedType: m.seedType, seedKey: m.seedKey, viewType: m.viewType,
      genreId: m.genreId, randomOn: m.randomOn, parentMapId: m.id,
    });
  }

  async markListened(): Promise<void> { /* ローカルでは記録しない */ }

  async genreFacets(mapId: string): Promise<GenreFacet[]> {
    const m = this.maps.get(mapId);
    if (!m) return [];
    const index = await this.repo.genreIndex();
    const counts = new Map<string, number>();
    for (const n of m.nodes) {
      const seen = new Set<string>();
      for (const g of n.genres) {
        for (const anc of ancestors(index, g)) {
          if (seen.has(anc)) continue;
          seen.add(anc);
          counts.set(anc, (counts.get(anc) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .map(([id, count]): GenreFacet => ({
        id,
        name: index.get(id)?.name ?? id,
        count,
        depth: genreDepth(index, id),
        hasChildren: (index.get(id)?.children.length ?? 0) > 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async sync(_pending: SyncPayload): Promise<{ accepted: number }> {
    // ローカルモードにはサーバーが無いので、端末 DB が唯一の正のまま何もしない。
    return { accepted: 0 };
  }

  async deleteAccount(): Promise<void> { /* ローカルモードでは対象がない */ }
}
