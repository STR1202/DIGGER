import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  ancestors, buildMap, expandMap, FREE_ENTITLEMENT, MAX_NODES, MockRepository,
  newRandomSeed, PRO_ENTITLEMENT, resolveViewType, depth as genreDepth,
  type DiggrMap, type Entitlement, type MusicRepository, type Plan,
} from '@diggr/core';
import { signToken, verifyToken } from './auth';

/**
 * DIGGR API（基本設計書 §8）。
 * 音楽データは月次パイプラインが作った読み取り専用スキーマ（music_v{n}）を引くだけで、
 * 外部サービスへの中継はしない。
 *
 * 永続化: このファイルはローカル検証・開発用に「プロセス内メモリ」で状態を持つ
 * （`services/api/sql/002_app_schema.sql` に対応する実テーブルへの置き換えは
 * `PgRepository` と同じ形の `AppStore` インターフェイスを想定。本番は Postgres 版に差し替える）。
 */
const PORT = Number(process.env['PORT'] ?? 8080);
const USE_MOCK = (process.env['DATA_SOURCE'] ?? 'mock') === 'mock';

// 本番では PgRepository（services/api/src/repo/pg.ts）に差し替える
const repo: MusicRepository = new MockRepository();

interface StoredMap { map: DiggrMap; ownerId: string }
interface Bookmark { id: string; targetType: 'artist' | 'genre' | 'map'; targetKey: string; targetName: string; createdAt: string }
interface CheckedRow { uid: string; checkedAt: string }
interface ListenedRow { uid: string; service: string; listenedAt: string }

/** マップは不変。生成したものを保存し、履歴・ブックマーク・引き直しの単位にする（FR-02b） */
const maps = new Map<string, StoredMap>();
const entitlements = new Map<string, Entitlement>();
const bookmarks = new Map<string, Map<string, Bookmark>>();
const checked = new Map<string, Map<string, CheckedRow>>();
const listened = new Map<string, Map<string, ListenedRow>>();
/** RevenueCat の app_user_id ↔ 内部ユーザー ID。匿名 ID をそのまま app_user_id にする運用を想定。 */
const knownUsers = new Set<string>();

function ensureUser(userId: string): void {
  knownUsers.add(userId);
  if (!entitlements.has(userId)) entitlements.set(userId, FREE_ENTITLEMENT);
  if (!bookmarks.has(userId)) bookmarks.set(userId, new Map());
  if (!checked.has(userId)) checked.set(userId, new Map());
  if (!listened.has(userId)) listened.set(userId, new Map());
}

function entitlementFor(userId: string): Entitlement {
  if (process.env['DEV_FORCE_PRO'] === '1') {
    return { plan: 'pro_yearly', ...PRO_ENTITLEMENT, expiresAt: null };
  }
  return entitlements.get(userId) ?? FREE_ENTITLEMENT;
}

const app = Fastify({ logger: true });
// モバイルアプリからは同一オリジン制約を受けないが、将来の LP・管理画面からの
// 呼び出しに備えて許可オリジンを絞った CORS を有効にしておく。
void app.register(cors, {
  origin: (process.env['CORS_ORIGINS'] ?? '').split(',').filter(Boolean),
});

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const PUBLIC_PATHS = ['/health', '/v1/health', '/v1/auth/anonymous', '/webhooks/revenuecat'];

app.addHook('onRequest', async (req, reply) => {
  if (PUBLIC_PATHS.some((p) => req.url === p || req.url.startsWith(`${p}?`))) return;
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'valid bearer token required' } });
    return;
  }
  req.userId = payload.sub;
  ensureUser(req.userId);
});

app.get('/health', async () => ({ ok: true, schema: repo.schemaVersion() }));
app.get('/v1/health', async () => ({ status: 'ok', schemaVersion: repo.schemaVersion() }));

// ── 認証（FR-14） ──────────────────────────────────────────────
app.post('/v1/auth/anonymous', async () => {
  const userId = randomUUID();
  ensureUser(userId);
  return { token: signToken(userId, true), userId };
});

interface LinkBody { provider: 'apple' | 'google'; identityToken: string; userId?: string }

/**
 * ソーシャル連携（FR-14）。実装では Apple/Google の署名検証を行った上で
 * 既存の匿名ユーザーへ merge する。ここでは検証器（Apple JWKS / Google tokeninfo）を
 * 差し込むための形だけ用意し、常に「渡された userId（無ければ新規）」に紐付ける。
 */
app.post<{ Body: LinkBody }>('/v1/auth/link', async (req, reply) => {
  if (!req.body?.identityToken) {
    return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'identityToken required' } });
  }
  const userId = req.body.userId ?? req.userId ?? randomUUID();
  ensureUser(userId);
  // TODO(本番): provider ごとに公開鍵で identityToken を検証し、sub をユーザーに紐付ける。
  return { token: signToken(userId, false), userId };
});

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
        type: 'artist' as const, key: a.mbid, name: a.name, hasGraph: a.hasGraph,
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
  const ent = entitlementFor(req.userId);
  const body = req.body;
  const index = await repo.genreIndex();
  const seedArtist = body.seedType === 'artist' ? await repo.getArtist(body.seedKey) : null;
  const seedGenre = body.seedType === 'genre' ? index.get(body.seedKey) : null;
  if (!seedArtist && !seedGenre) {
    return reply.code(404).send({ error: { code: 'SEED_NOT_FOUND', message: body.seedKey } });
  }
  const seedHasGraph = seedArtist ? seedArtist.hasGraph : true;
  const viewType = resolveViewType(body.viewType, body.seedType, seedHasGraph);
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
    seedHasGraph,
    ...(viewType === 'related' ? { similar: await repo.similarTo(body.seedKey, 650) } : {}),
    ...(viewType === 'genre' && genreId
      ? {
        members: (await repo.genreMembers(genreId, 1000)).filter((a) => a.mbid !== body.seedKey),
        knownMbids: seedArtist && seedHasGraph
          ? new Set((await repo.similarTo(seedArtist.mbid, ent.nodeLimit)).map((r) => r.artist.mbid))
          : new Set<string>(),
      }
      : {}),
    genreIndex: index,
  });
  maps.set(map.id, { map, ownerId: req.userId });
  return map;
});

app.get<{ Params: { id: string } }>('/v1/maps/:id', async (req, reply) => {
  const stored = maps.get(req.params.id);
  if (!stored) return reply.code(404).send({ error: { code: 'MAP_NOT_FOUND', message: req.params.id } });
  const map = stored.map;
  const ent = entitlementFor(req.userId);
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
  maps.set(merged.id, { map: merged, ownerId: stored.ownerId });
  return merged;
});

app.post<{ Params: { id: string } }>('/v1/maps/:id/reroll', async (req, reply) => {
  const stored = maps.get(req.params.id);
  if (!stored) return reply.code(404).send({ error: { code: 'MAP_NOT_FOUND', message: req.params.id } });
  const map = stored.map;
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
  const stored = maps.get(req.params.id);
  if (!stored) return { items: [] };
  const index = await repo.genreIndex();
  const counts = new Map<string, number>();
  for (const n of stored.map.nodes) {
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

app.get('/v1/entitlements', async (req) => entitlementFor(req.userId));

app.post('/v1/entitlements/reward', async (req) => {
  // §9.3 リワード広告で 30 分だけ 100 件に解放する。実装ではトークンをサーバーで管理する。
  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const reward: Entitlement = { plan: 'free', ...PRO_ENTITLEMENT, nodeLimit: MAX_NODES, expiresAt: until };
  entitlements.set(req.userId, reward);
  return reward;
});

// ── ユーザーデータ（履歴・ブックマーク・チェック済み・聴いた記録） ──────────

app.get('/v1/me/maps', async (req) => ({
  items: [...maps.values()]
    .filter((s) => s.ownerId === req.userId)
    .sort((a, b) => (a.map.createdAt < b.map.createdAt ? 1 : -1))
    .map((s) => s.map),
}));

app.get('/v1/me/bookmarks', async (req) => ({ items: [...(bookmarks.get(req.userId)?.values() ?? [])] }));

interface BookmarkBody { targetType: Bookmark['targetType']; targetKey: string; targetName: string }

app.post<{ Body: BookmarkBody }>('/v1/me/bookmarks', async (req, reply) => {
  const own = bookmarks.get(req.userId)!;
  const ent = entitlementFor(req.userId);
  const limit = ent.plan === 'free' ? 10 : Number.POSITIVE_INFINITY;
  const key = `${req.body.targetType}:${req.body.targetKey}`;
  if (!own.has(key) && own.size >= limit) {
    return reply.code(403).send({ error: { code: 'BOOKMARK_LIMIT', message: `free plan allows ${limit}` } });
  }
  own.set(key, { id: key, ...req.body, createdAt: new Date().toISOString() });
  return reply.code(204).send();
});

app.delete<{ Params: { type: string; key: string } }>('/v1/me/bookmarks/:type/:key', async (req, reply) => {
  bookmarks.get(req.userId)?.delete(`${req.params.type}:${req.params.key}`);
  return reply.code(204).send();
});

interface SyncBody {
  bookmarks?: { targetType: Bookmark['targetType']; targetKey: string; targetName: string; createdAt: string }[];
  checked?: { uid: string; checkedAt: string }[];
  listened?: { uid: string; service: string; listenedAt: string }[];
}

/** 技術選定書 §3.5.3: 端末に溜まった未同期の操作をまとめて受け取る（Last-Write-Wins）。 */
app.post<{ Body: SyncBody }>('/v1/me/sync', async (req) => {
  const own = { bookmarks: bookmarks.get(req.userId)!, checked: checked.get(req.userId)!, listened: listened.get(req.userId)! };
  let accepted = 0;
  for (const b of req.body.bookmarks ?? []) {
    const key = `${b.targetType}:${b.targetKey}`;
    own.bookmarks.set(key, { id: key, ...b });
    accepted += 1;
  }
  for (const c of req.body.checked ?? []) {
    own.checked.set(c.uid, c);
    accepted += 1;
  }
  for (const l of req.body.listened ?? []) {
    own.listened.set(`${l.uid}:${l.service}`, l);
    accepted += 1;
  }
  return { accepted, conflicts: [] };
});

app.get<{ Querystring: { since?: string } }>('/v1/me/sync', async (req) => {
  const since = req.query.since ? Date.parse(req.query.since) : 0;
  const after = (iso: string): boolean => Date.parse(iso) > since;
  return {
    bookmarks: [...(bookmarks.get(req.userId)?.values() ?? [])].filter((b) => after(b.createdAt)),
    checked: [...(checked.get(req.userId)?.values() ?? [])].filter((c) => after(c.checkedAt)),
    listened: [...(listened.get(req.userId)?.values() ?? [])].filter((l) => after(l.listenedAt)),
  };
});

app.post<{ Body: { mbid: string } }>('/v1/me/listened', async (req, reply) => {
  const own = listened.get(req.userId)!;
  const row: ListenedRow = { uid: req.body.mbid, service: 'unknown', listenedAt: new Date().toISOString() };
  own.set(`${row.uid}:${row.service}`, row);
  checked.get(req.userId)!.set(row.uid, { uid: row.uid, checkedAt: row.listenedAt });
  return reply.code(204).send();
});

/** アカウントと全データの削除。サーバー側の全データを消す（端末 DB は別途クライアントが消す）。 */
app.delete('/v1/me', async (req, reply) => {
  for (const [id, s] of maps) if (s.ownerId === req.userId) maps.delete(id);
  bookmarks.delete(req.userId);
  checked.delete(req.userId);
  listened.delete(req.userId);
  entitlements.delete(req.userId);
  knownUsers.delete(req.userId);
  return reply.code(204).send();
});

// ── 課金 Webhook（RevenueCat） ─────────────────────────────────

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id?: string;
    expiration_at_ms?: number;
    period_type?: string;
  };
}

const PLAN_BY_PRODUCT: Record<string, Plan> = {
  'diggr.pro.monthly': 'pro_monthly',
  'diggr.pro.yearly': 'pro_yearly',
};

/**
 * RevenueCat の Webhook（技術選定書 §7.1）。`Authorization` ヘッダを共有シークレットで検証する。
 * https://www.revenuecat.com/docs/integrations/webhooks を参照。
 */
app.post<{ Body: RevenueCatEvent }>('/webhooks/revenuecat', async (req, reply) => {
  const expected = process.env['REVENUECAT_WEBHOOK_SECRET'];
  if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'bad webhook secret' } });
  }
  const { event } = req.body;
  const userId = event.app_user_id;
  ensureUser(userId);

  const cancelTypes = new Set(['CANCELLATION', 'EXPIRATION']);
  if (cancelTypes.has(event.type)) {
    entitlements.set(userId, FREE_ENTITLEMENT);
    return reply.code(204).send();
  }
  const plan = (event.product_id ? PLAN_BY_PRODUCT[event.product_id] : undefined) ?? 'pro_monthly';
  entitlements.set(userId, {
    plan, ...PRO_ENTITLEMENT,
    expiresAt: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
  });
  return reply.code(204).send();
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`diggr api on :${PORT} (${USE_MOCK ? 'mock' : 'postgres'})`))
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
