import Fastify from 'fastify';
import {
  ancestors, buildMap, expandMap, FREE_ENTITLEMENT, MAX_NODES, MockRepository,
  newRandomSeed, PRO_ENTITLEMENT, depth as genreDepth,
  type DiggrMap, type Entitlement, type MusicRepository,
} from '@diggr/core';

/**
 * DIGGR API（基本設計書 §8）。
 * 音楽データは月次パイプラインが作った読み取り専用スキーマ（music_v{n}）を引くだけで、
 * 外部サービスへの中継はしない。
 */
const PORT = Number(process.env['PORT'] ?? 8080);
const USE_MOCK = (process.env['DATA_SOURCE'] ?? 'mock') === 'mock';

// 本番では PgRepository（services/api/src/repo/pg.ts）に差し替える
const repo: MusicRepository = new MockRepository();

/** マップは不変。生成したものを保存し、履歴・ブックマーク・引き直しの単位にする（FR-02b） */
const maps = new Map<string, DiggrMap>();
const listened = new Map<string, Set<string>>();

function entitlementFor(userId: string): Entitlement {
  // 実装では entitlements テーブル（RevenueCat Webhook が更新）を引く
  return process.env['DEV_FORCE_PRO'] === '1'
    ? { plan: 'pro_yearly', ...PRO_ENTITLEMENT, expiresAt: null }
    : FREE_ENTITLEMENT;
}

const app = Fastify({ logger: true });

app.addHook('onRequest', async (req, reply) => {
  // 匿名 JWT（FR-14）。ここでは検証を省略し、ヘッダの有無だけ確認する。
  const auth = req.headers.authorization;
  if (!auth && !req.url.startsWith('/health')) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'token required' } });
  }
});

const userIdOf = (auth: string | undefined): string => auth?.slice(7) ?? 'anonymous';

app.get('/health', async () => ({ ok: true, schema: repo.schemaVersion() }));

app.get<{ Querystring: { q?: string } }>('/v1/search', async (req) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return { items: [] };
  const index = await repo.genreIndex();
  const [artists, genres] = await Promise.all([
    repo.searchArtists(q, 12),
    repo.searchGenres(q, 6),
  ]);
  return {
    items: [
      ...artists.map((a) => ({
        type: 'artist' as const, key: a.mbid, name: a.name,
        subtitle: `${a.country ?? ''} ${a.beginYear ?? ''}`,
      })),
      ...genres.map((g) => ({
        type: 'genre' as const, key: g.id, name: g.name,
        subtitle: `第${genreDepth(index, g.id)}階層 · ${g.count} 組`,
      })),
    ],
  };
});

interface CreateMapBody {
  seedType: 'artist' | 'genre';
  seedKey: string;
  viewType: 'related' | 'genre';
  genreId?: string | null;
  randomOn?: boolean;
  parentMapId?: string | null;
}

app.post<{ Body: CreateMapBody }>('/v1/maps', async (req, reply) => {
  const ent = entitlementFor(userIdOf(req.headers.authorization));
  const body = req.body;
  const index = await repo.genreIndex();
  const seedArtist = body.seedType === 'artist' ? await repo.getArtist(body.seedKey) : null;
  const seedGenre = body.seedType === 'genre' ? index.get(body.seedKey) : null;
  if (!seedArtist && !seedGenre) {
    return reply.code(404).send({ error: { code: 'SEED_NOT_FOUND', message: body.seedKey } });
  }
  const viewType = body.seedType === 'genre' ? 'genre' : body.viewType;
  const genreId = viewType === 'genre'
    ? (body.genreId ?? seedGenre?.id ?? seedArtist!.genres[0]!)
    : null;

  const map = buildMap({
    mapId: `01J${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`,
    seedType: body.seedType,
    seedKey: body.seedKey,
    seedName: seedArtist?.name ?? seedGenre!.name,
    viewType,
    genreId,
    entitlement: ent,
    randomOn: body.randomOn ?? false,
    randomSeed: newRandomSeed(),
    parentMapId: body.parentMapId ?? null,
    schemaVersion: repo.schemaVersion(),
    ...(viewType === 'related' ? { similar: await repo.similarTo(body.seedKey, 650) } : {}),
    ...(viewType === 'genre' && genreId
      ? {
        members: (await repo.genreMembers(genreId, 1000)).filter((a) => a.mbid !== body.seedKey),
        knownMbids: seedArtist
          ? new Set((await repo.similarTo(seedArtist.mbid, ent.nodeLimit)).map((r) => r.artist.mbid))
          : new Set<string>(),
      }
      : {}),
    genreIndex: index,
  });
  maps.set(map.id, map);
  return map;
});

app.get<{ Params: { id: string } }>('/v1/maps/:id', async (req, reply) => {
  const map = maps.get(req.params.id);
  if (!map) return reply.code(404).send({ error: { code: 'MAP_NOT_FOUND', message: req.params.id } });
  const ent = entitlementFor(userIdOf(req.headers.authorization));
  if (ent.nodeLimit <= map.nodes.length) return map;
  // 権利が上がったら引き直さずに広げる（UC-02）
  const fresh = await app.inject({
    method: 'POST', url: '/v1/maps',
    headers: { authorization: req.headers.authorization ?? '' },
    payload: {
      seedType: map.seedType, seedKey: map.seedKey, viewType: map.viewType,
      genreId: map.genreId, randomOn: map.randomOn, parentMapId: map.parentMapId,
    } satisfies CreateMapBody,
  }).then((r) => JSON.parse(r.payload) as DiggrMap);
  const merged = expandMap(map, fresh);
  maps.delete(fresh.id);
  maps.set(merged.id, merged);
  return merged;
});

app.post<{ Params: { id: string } }>('/v1/maps/:id/reroll', async (req, reply) => {
  const map = maps.get(req.params.id);
  if (!map) return reply.code(404).send({ error: { code: 'MAP_NOT_FOUND', message: req.params.id } });
  if (!map.canReroll) {
    return reply.code(409).send({
      error: { code: 'REROLL_UNAVAILABLE', message: 'random display is off or the pool is exhausted' },
    });
  }
  const r = await app.inject({
    method: 'POST', url: '/v1/maps',
    headers: { authorization: req.headers.authorization ?? '' },
    payload: {
      seedType: map.seedType, seedKey: map.seedKey, viewType: map.viewType,
      genreId: map.genreId, randomOn: map.randomOn, parentMapId: map.id,
    } satisfies CreateMapBody,
  });
  return JSON.parse(r.payload) as DiggrMap;
});

app.get<{ Params: { id: string } }>('/v1/maps/:id/genres', async (req) => {
  const map = maps.get(req.params.id);
  if (!map) return { items: [] };
  const index = await repo.genreIndex();
  const counts = new Map<string, number>();
  for (const n of map.nodes) {
    const seen = new Set<string>();
    for (const g of n.genres) {
      for (const a of ancestors(index, g)) {
        if (seen.has(a)) continue;
        seen.add(a);
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
  }
  return {
    items: [...counts.entries()]
      .map(([id, count]) => ({
        id, count,
        name: index.get(id)?.name ?? id,
        depth: genreDepth(index, id),
        hasChildren: (index.get(id)?.children.length ?? 0) > 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
});

app.get('/v1/entitlements', async (req) => entitlementFor(userIdOf(req.headers.authorization)));

app.post('/v1/entitlements/reward', async (req) => {
  // §9.3 リワード広告で 30 分だけ 100 件に解放する。実装ではトークンをサーバーで管理する。
  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { plan: 'free', ...PRO_ENTITLEMENT, nodeLimit: MAX_NODES, expiresAt: until };
});

app.post<{ Body: { mbid: string } }>('/v1/me/listened', async (req, reply) => {
  const user = userIdOf(req.headers.authorization);
  const set = listened.get(user) ?? new Set<string>();
  set.add(req.body.mbid);
  listened.set(user, set);
  return reply.code(204).send();
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`diggr api on :${PORT} (${USE_MOCK ? 'mock' : 'postgres'})`))
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
