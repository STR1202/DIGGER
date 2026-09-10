import { buildGenreIndex, MOCK_GENRES, type GenreIndex } from '@diggr/core';
import type { GenreColorKey } from '../theme/tokens';

/**
 * ジャンルの分類表。
 * 語彙はアプリのバージョンに紐づく静的データとして持ち、
 * 本番では起動時に GET /genres で取得したものをキャッシュして差し替える
 * （ID は月次パイプラインをまたいで安定しているため、表示名の更新だけで足りる）。
 */
export const genreIndex: GenreIndex = buildGenreIndex(MOCK_GENRES);

export const genreName = (id: string): string => genreIndex.get(id)?.name ?? id;

export const categoryOf = (id: string): GenreColorKey =>
  (genreIndex.get(id)?.category ?? 'pop') as GenreColorKey;
