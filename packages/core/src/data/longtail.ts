/**
 * 「グラフの無いアーティスト」のモック（基本設計書 v3.2 FR-01 の二層化）。
 * mock.ts は prototype/diggr-demo.html からの自動抽出なので手で足さず、
 * この層だけ別ファイルに持つ。実装では Apple Music Feed 由来の長尾アーティスト
 * （MusicBrainz に未登録、類似度シグナルが 0 件）に相当する（技術選定書 §4.2.1）。
 *
 * 検索対象には含めるがグラフは持たない ＝ 掘ると「同じジャンル」の地図が黙って開く。
 */
import type { Artist } from '../types';

export type LongTailArtist = Omit<Artist, 'hasGraph'>;

export const LONGTAIL_ARTISTS: readonly LongTailArtist[] = [
  { mbid: 'lt-001', name: 'Pale Static', country: 'JP', beginYear: 2019, endYear: null, popularity: 0.06, genres: ['shoegaze'] },
  { mbid: 'lt-002', name: 'Low Orbit Choir', country: 'SE', beginYear: 2021, endYear: null, popularity: 0.05, genres: ['ambient'] },
  { mbid: 'lt-003', name: '夜行性ノイズ', country: 'JP', beginYear: 2020, endYear: null, popularity: 0.04, genres: ['noise'] },
  { mbid: 'lt-004', name: 'Salt Garden', country: 'KR', beginYear: 2018, endYear: null, popularity: 0.07, genres: ['dream-pop'] },
  { mbid: 'lt-005', name: 'Concrete Choir', country: 'DE', beginYear: 2022, endYear: null, popularity: 0.03, genres: ['post-punk'] },
  { mbid: 'lt-006', name: 'Tidewater Ensemble', country: 'PT', beginYear: 2017, endYear: null, popularity: 0.06, genres: ['modern-classical'] },
  { mbid: 'lt-007', name: '灯芯', country: 'TW', beginYear: 2021, endYear: null, popularity: 0.05, genres: ['folk'] },
  { mbid: 'lt-008', name: 'Rhodes & Static', country: 'US', beginYear: 2019, endYear: null, popularity: 0.08, genres: ['fusion'] },
  { mbid: 'lt-009', name: 'Glass Corridor', country: 'GB', beginYear: 2023, endYear: null, popularity: 0.03, genres: ['idm'] },
  { mbid: 'lt-010', name: 'Sable Horizon', country: 'BR', beginYear: 2020, endYear: null, popularity: 0.05, genres: ['downtempo'] },
  { mbid: 'lt-011', name: '硝子の街', country: 'JP', beginYear: 2016, endYear: null, popularity: 0.09, genres: ['city-pop'] },
  { mbid: 'lt-012', name: 'Faint Weather', country: 'FI', beginYear: 2022, endYear: null, popularity: 0.04, genres: ['minimalism'] },
  { mbid: 'lt-013', name: 'Half-Light Society', country: 'CA', beginYear: 2015, endYear: null, popularity: 0.07, genres: ['neo-soul'] },
  { mbid: 'lt-014', name: 'Quiet Machinery', country: 'NL', beginYear: 2021, endYear: null, popularity: 0.05, genres: ['techno'] },
  { mbid: 'lt-015', name: '雨傘計画', country: 'CN', beginYear: 2019, endYear: null, popularity: 0.06, genres: ['art-pop'] },
  { mbid: 'lt-016', name: 'Root & Static', country: 'ZA', beginYear: 2018, endYear: null, popularity: 0.05, genres: ['afrobeat'] },
  { mbid: 'lt-017', name: 'Cassette Weather', country: 'MX', beginYear: 2020, endYear: null, popularity: 0.04, genres: ['synth-pop'] },
  { mbid: 'lt-018', name: 'Nine Lantern', country: 'JP', beginYear: 2014, endYear: null, popularity: 0.10, genres: ['jpop'] },
];
