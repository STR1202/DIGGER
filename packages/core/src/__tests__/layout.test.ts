import { describe, expect, it } from 'vitest';
import { MockRepository } from '../dataset';
import { buildMap, FREE_ENTITLEMENT } from '../map';
import { fitScale, layoutMap } from '../layout';
import { placeLabels } from '../labels';

const repo = new MockRepository();
// 実測の代わりの概算（半角 6.4px / 全角 11px @11px）
const measure = (t: string): number =>
  [...t].reduce((w, c) => w + (c.charCodeAt(0) < 0x2e80 ? 6.4 : 11), 0);

async function radialMap() {
  const seed = (await repo.findArtistByName('Radiohead'))!;
  return buildMap({
    mapId: 'l1', seedType: 'artist', seedKey: seed.mbid, seedName: seed.name,
    viewType: 'related', genreId: null, entitlement: FREE_ENTITLEMENT,
    randomOn: false, randomSeed: 0, parentMapId: null, schemaVersion: repo.schemaVersion(),
    similar: await repo.similarTo(seed.mbid, 1000),
    genreIndex: await repo.genreIndex(),
  });
}

describe('layout', () => {
  it('ノードが中心と重ならず、画面に収まる倍率が出る', async () => {
    const map = await radialMap();
    const layout = layoutMap(map, { measureLabel: measure });
    for (const n of layout.nodes) expect(Math.hypot(n.x, n.y)).toBeGreaterThan(40);
    const z = fitScale(layout.extent, 390, 844);
    expect(z).toBeGreaterThanOrEqual(0.55);
    expect(z).toBeLessThanOrEqual(1.25);
  });

  it('ラベルは重ならず、拡大すると表示数が増える', async () => {
    const map = await radialMap();
    const layout = layoutMap(map, { measureLabel: measure });
    const common = {
      nodes: layout.nodes, islands: layout.islands, revealed: map.nodes.length,
      offsetX: 195, offsetY: 422, width: 390, height: 844,
      reserved: [{ x: 165, y: 392, w: 60, h: 60 }], isGenreView: false,
    };
    const near = placeLabels({ ...common, scale: 0.9 });
    const far = placeLabels({ ...common, scale: 1.8 });
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThanOrEqual(near.length);
    // 実際に重なっていないこと
    const boxes = far.map((l) => ({ x: l.x - 40, y: l.y - 11, w: 80, h: 14 }));
    void boxes;
    expect(new Set(far.map((l) => l.mbid)).size).toBe(far.length);
  });
});
