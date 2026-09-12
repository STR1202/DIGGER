import { describe, expect, it } from 'vitest';
import { MockRepository } from '../dataset';
import { buildMap, expandMap, FREE_ENTITLEMENT, MAX_NODES, PRO_ENTITLEMENT, resolveViewType } from '../map';
import type { Entitlement } from '../types';

const repo = new MockRepository();
const PRO: Entitlement = { plan: 'pro_yearly', ...PRO_ENTITLEMENT, expiresAt: null };

async function make(opts: {
  ent?: Entitlement; randomOn?: boolean; seed?: number; view?: 'related' | 'genre';
}) {
  const seed = (await repo.findArtistByName('Radiohead'))!;
  const ent = opts.ent ?? FREE_ENTITLEMENT;
  const index = await repo.genreIndex();
  const view = opts.view ?? 'related';
  const genreId = seed.genres[0]!;
  return buildMap({
    mapId: 'test', seedType: 'artist', seedKey: seed.mbid, seedName: seed.name,
    viewType: view, genreId: view === 'genre' ? genreId : null,
    entitlement: ent, randomOn: opts.randomOn ?? false, randomSeed: opts.seed ?? 42,
    parentMapId: null, schemaVersion: repo.schemaVersion(),
    ...(view === 'related' ? { similar: await repo.similarTo(seed.mbid, 1000) } : {}),
    ...(view === 'genre'
      ? {
        members: (await repo.genreMembers(genreId, 1000)).filter((a) => a.mbid !== seed.mbid),
        knownMbids: new Set(
          (await repo.similarTo(seed.mbid, ent.nodeLimit)).map((r) => r.artist.mbid),
        ),
      }
      : {}),
    genreIndex: index,
  });
}

describe('buildMap', () => {
  it('無料プランは 30 件・確定枠は 20 件まで', async () => {
    const m = await make({});
    expect(m.nodes).toHaveLength(30);
    expect(m.coreCount).toBeLessThanOrEqual(FREE_ENTITLEMENT.coreCap);
    expect(m.ghosts).toBe(MAX_NODES - 30);
  });

  it('Pro は 100 件まで広がる', async () => {
    const m = await make({ ent: PRO });
    expect(m.nodes).toHaveLength(MAX_NODES);
    expect(m.ghosts).toBe(0);
  });

  it('ランダム表示 OFF なら毎回同じ地図になる（既定）', async () => {
    const a = await make({});
    const b = await make({});
    expect(a.nodes.map((n) => n.mbid)).toEqual(b.nodes.map((n) => n.mbid));
    expect(a.canReroll).toBe(false);
    expect(a.randomSeed).toBe(0);
  });

  it('ランダム表示 ON で確定枠は据え置き、外側だけ変わる', async () => {
    const a = await make({ randomOn: true, seed: 1 });
    const b = await make({ randomOn: true, seed: 2 });
    const coreA = a.nodes.filter((n) => n.tier === 'core').map((n) => n.mbid);
    const coreB = b.nodes.filter((n) => n.tier === 'core').map((n) => n.mbid);
    expect(coreA).toEqual(coreB);
    const randA = a.nodes.filter((n) => n.tier === 'random').map((n) => n.mbid);
    const randB = new Set(b.nodes.filter((n) => n.tier === 'random').map((n) => n.mbid));
    expect(randA.filter((id) => randB.has(id)).length).toBeLessThan(randA.length);
    expect(a.canReroll).toBe(true);
  });

  it('同じ乱数シードなら完全に再現できる（FR-02b）', async () => {
    const a = await make({ randomOn: true, seed: 12345 });
    const b = await make({ randomOn: true, seed: 12345 });
    expect(a.nodes.map((n) => n.mbid)).toEqual(b.nodes.map((n) => n.mbid));
  });

  it('確定枠のスコアは 0.60 以上、ランダム枠は順位を持たない', async () => {
    const m = await make({});
    for (const n of m.nodes) {
      if (n.tier === 'core') expect(n.score!).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('同じジャンルの地図は関連の顔ぶれを避け、島に分かれる', async () => {
    const rel = await make({});
    const gen = await make({ view: 'genre' });
    const relIds = new Set(rel.nodes.map((n) => n.mbid));
    const overlap = gen.nodes.filter((n) => relIds.has(n.mbid)).length;
    expect(overlap).toBeLessThan(gen.nodes.length / 2);
    expect(new Set(gen.nodes.map((n) => n.cluster)).size).toBeGreaterThan(1);
    expect(gen.coreCount).toBe(0);
  });

  it('課金しても引き直さず、見えていたノードは残る（UC-02）', async () => {
    const free = await make({});
    const pro = await make({ ent: PRO });
    const merged = expandMap(free, pro);
    expect(merged.id).toBe(free.id);
    expect(merged.nodes).toHaveLength(MAX_NODES);
    for (const n of free.nodes) {
      expect(merged.nodes.some((m) => m.mbid === n.mbid)).toBe(true);
    }
  });
});

describe('resolveViewType（FR-01 二層化）', () => {
  it('グラフの無いアーティストで「関連」を頼んでも、黙ってジャンルに落ちる', () => {
    expect(resolveViewType('related', 'artist', false)).toBe('genre');
  });
  it('グラフのあるアーティストは頼んだとおり', () => {
    expect(resolveViewType('related', 'artist', true)).toBe('related');
    expect(resolveViewType('genre', 'artist', true)).toBe('genre');
  });
  it('ジャンル起点は常にジャンル表示（グラフの有無に関係ない）', () => {
    expect(resolveViewType('related', 'genre', false)).toBe('genre');
    expect(resolveViewType('genre', 'genre', true)).toBe('genre');
  });
});

describe('MockRepository の長尾アーティスト（グラフ無し）', () => {
  it('検索対象には含まれるが hasGraph=false で返る', async () => {
    const repo = new MockRepository();
    const found = await repo.searchArtists('Pale Static', 5);
    expect(found).toHaveLength(1);
    expect(found[0]!.hasGraph).toBe(false);
  });
  it('自分のジャンルの地図には所属アーティストとして出てくる', async () => {
    const repo = new MockRepository();
    const a = (await repo.findArtistByName('Pale Static'))!;
    const members = await repo.genreMembers(a.genres[0]!, 1000);
    expect(members.some((m) => m.mbid === a.mbid)).toBe(true);
  });
});
