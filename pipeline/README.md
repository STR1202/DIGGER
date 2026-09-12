# @diggr/pipeline

月次データパイプライン（基本設計書 §6.2）の**出発点**。ここにあるのは、
ライセンス境界を守る仕組み（`allowlist.ts`）と、それを実データで確認できる
小規模フェッチャー（`sources/musicbrainz.ts`）と CLI（`cli/fetch-sample.ts`）。

## 今できること

- `npm run check:license --workspace @diggr/pipeline`
  — MusicBrainz のタグ由来データ（CC BY-NC-SA 3.0、商用不可）を取り込み対象に
  含めていないことを検証する CI チェック（基本設計書 §3.5.6 項目 2）。CI に組み込み済み。
- `MUSICBRAINZ_USER_AGENT="App/0.1 (you@example.com)" npm run fetch:sample --workspace @diggr/pipeline -- "Radiohead"`
  — MusicBrainz の公開 Web Service から実データを 1 件取得し、allowlist を通して
  タグが確実に落ちることを目視確認できる。

## まだ無いもの（本番の月次パイプラインに必要な残り）

基本設計書 §6.2.1 の 10 ステップのうち、ここにあるのはステップ 2（抽出・ホワイトリスト）の
仕組みと、ステップ 1 の疎通確認だけ。以下は未実装で、実データでの構築が必要：

| ステップ | 内容 | 必要なもの |
| --- | --- | --- |
| 1（本番形） | MusicBrainz **コアデータダンプ**（`mbdump`、数十 GB）の取得・展開 | 大容量ディスクを持つ実行環境 |
| 1 | ListenBrainz / Discogs / Wikidata の一括ダンプ取得 | 同上 |
| 1b | Apple Music Feed のエクスポート取得 | **Apple Developer Program の会員資格・Media Services キー**（基本設計書 §3.1.2） |
| 3〜7 | 突合・類似度計算（`packages/core/src/similarity.ts` のロジックを実データに適用）・二層分割・外部 ID 解決 | 上記データ一式 |
| 9〜10 | `music_v{n}` スキーマへの投入・検証 | 稼働中の PostgreSQL（`services/api/sql/`） |

これらは実行に数十 GB のディスクと数時間、かつ Apple 分は実アカウントを要するため、
この開発環境では実行できない。`infra/docker-compose.yml` の `pipeline` サービスは
このパッケージをコンテナ化してその環境で動かす想定のプレースホルダー。

MusicBrainz Web Service（`ws/2`）は差分確認・小規模検証にのみ使うこと。
全件走査には使わない（基本設計書 §3.5.2 の表）。
