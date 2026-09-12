-- 音楽グラフ領域（基本設計書 §7.1）
-- 月次パイプラインがバージョン付きスキーマへ書き込み、検証が通ってから search_path を切り替える。
-- 既存スキーマは直接更新しない（ADR-09'）。ロールバックは参照先を戻すだけ。

CREATE SCHEMA IF NOT EXISTS music_v20260901;
SET search_path TO music_v20260901, public;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE artists (
  mbid         uuid PRIMARY KEY,
  name         text NOT NULL,
  sort_name    text NOT NULL,
  aliases      text[] NOT NULL DEFAULT '{}',
  country      char(2),
  begin_year   int,
  end_year     int,
  popularity   real NOT NULL,          -- 0.0–1.0。突合の優先順にも使う
  discogs_id   bigint,
  wikidata_id  text,
  -- 類似度グラフを持つか（基本設計書 v3.2 FR-01 の二層化）。false は検索・ジャンル地図の
  -- 対象だが、関連アーティスト地図（artist_similarity / artist_pool）には行が無い。
  has_graph    boolean NOT NULL DEFAULT true
);
CREATE INDEX artists_name_trgm ON artists USING gin (name gin_trgm_ops);
CREATE INDEX artists_alias_trgm ON artists USING gin (aliases);
CREATE INDEX artists_popularity ON artists (popularity DESC);

-- 確定枠（上位 40 件）。スコア・順位・関係タイプを行で持つ。
CREATE TABLE artist_similarity (
  src_mbid       uuid NOT NULL,
  dst_mbid       uuid NOT NULL,
  score          real NOT NULL,
  rank           smallint NOT NULL,
  relation_types text[] NOT NULL,
  PRIMARY KEY (src_mbid, dst_mbid)
);
CREATE INDEX artist_similarity_src_rank ON artist_similarity (src_mbid, rank);

-- ランダム枠のプール（41–650 位）。順位もスコアも使わないので集合で持つ（ADR-17）。
CREATE TABLE artist_pool (
  src_mbid   uuid PRIMARY KEY,
  pool_mbids uuid[] NOT NULL,
  pool_size  smallint NOT NULL
);

CREATE TABLE genres (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  category     text NOT NULL,          -- 表示色の 8 系統
  artist_count int NOT NULL DEFAULT 0
);

CREATE TABLE genre_hierarchy (
  parent_id text NOT NULL REFERENCES genres(id),
  child_id  text NOT NULL REFERENCES genres(id),
  depth     smallint NOT NULL,         -- 最大 3 階層（FR-10）
  PRIMARY KEY (parent_id, child_id)
);

CREATE TABLE artist_genres (
  mbid     uuid NOT NULL REFERENCES artists(mbid),
  genre_id text NOT NULL REFERENCES genres(id),
  weight   real NOT NULL,              -- 最大のものが主ジャンル（FR-29）
  PRIMARY KEY (mbid, genre_id)
);
CREATE INDEX artist_genres_genre ON artist_genres (genre_id, weight DESC);
