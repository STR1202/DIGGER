-- アプリケーション領域（基本設計書 §7.2）。読み書きし、スキーマ切り替えの影響を受けない。
SET search_path TO public;

CREATE TABLE IF NOT EXISTS users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id      text UNIQUE NOT NULL,
  apple_sub         text UNIQUE,
  google_sub        text UNIQUE,
  country           char(2) NOT NULL,
  preferred_service text NOT NULL DEFAULT 'spotify',   -- FR-23
  random_on         boolean NOT NULL DEFAULT false,    -- 検索時に選ぶランダム表示（既定オフ）
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan        text NOT NULL DEFAULT 'free',            -- free / pro_monthly / pro_yearly
  node_limit  int  NOT NULL DEFAULT 30,
  core_cap    int  NOT NULL DEFAULT 20,
  ads_disabled boolean NOT NULL DEFAULT false,
  expires_at  timestamptz,
  store       text NOT NULL DEFAULT 'app_store',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- マップは「ノード集合そのもの」を保存する（FR-02b / ADR-18）。
-- 乱数シードだけでは、月次更新でプールの中身が変わったときに同じ地図が再現できない。
CREATE TABLE IF NOT EXISTS maps (
  id             text PRIMARY KEY,                     -- ULID
  owner_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_type      text NOT NULL,                        -- artist / genre
  seed_key       text NOT NULL,
  seed_name      text NOT NULL,
  view_type      text NOT NULL,                        -- related / genre（FR-29）
  genre_id       text,
  node_mbids     uuid[] NOT NULL,                      -- 確定枠が先頭
  core_count     smallint NOT NULL,
  random_on      boolean NOT NULL DEFAULT false,
  random_seed    bigint NOT NULL DEFAULT 0,            -- ランダム表示 OFF のときは 0
  schema_version text NOT NULL,
  parent_map_id  text REFERENCES maps(id) ON DELETE SET NULL,  -- 引き直しの系譜（FR-27）
  revealed       smallint NOT NULL DEFAULT 10,         -- 段階表示の到達点（FR-28）
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maps_owner_created ON maps (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bookmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL,                           -- artist / genre / map
  target_key  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_key)
);

CREATE TABLE IF NOT EXISTS listened (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mbid      uuid NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mbid)
);

-- 詳細シートを開いたアーティストの印（FR-31）。端末 DB の `checked` の写し。
CREATE TABLE IF NOT EXISTS checked (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mbid       uuid NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mbid)
);

CREATE TABLE IF NOT EXISTS purchase_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  product_id  text,
  raw_payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- 90 日アクセスのないマップは消す。ブックマーク済みは残す（R-33）。
-- 日次バッチから実行する。
-- DELETE FROM maps m
--  WHERE m.last_opened_at < now() - interval '90 days'
--    AND NOT EXISTS (
--      SELECT 1 FROM bookmarks b
--       WHERE b.target_type = 'map' AND b.target_key = m.id);
