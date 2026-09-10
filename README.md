# DIGGR

音楽の関連アーティストをネットワークグラフで掘るモバイルアプリ。
設計は **[docs/DESIGN.md](docs/DESIGN.md)（マスター版 v3.0）** が正。
v2.4 の 基本設計書 / 画面設計書 / 技術選定書 を統合し、以降の変更をすべて反映してある。

## 何が入っているか

```
packages/core     ドメイン層（TypeScript、UI 非依存）
                  マップ生成・二層構造・決定的乱数・レイアウト・ラベル配置
                  アプリとサーバーが同じコードを使う。テストはここに集約する。
apps/mobile       Expo / React Native アプリ（iOS・Android）
                  Skia 描画 + Reanimated ジェスチャ、Zustand、TanStack Query
services/api      Fastify の API サーバー（基本設計書 §8）と PostgreSQL スキーマ
prototype/        仕様確認用の 1 ファイル HTML デモ（モックデータの供給元）
```

## 動かす

> **動作確認のやり方**: [docs/VERIFY.md](docs/VERIFY.md)
>
> **iOS**: Mac + Xcode があるなら [docs/MAC_SETUP.md](docs/MAC_SETUP.md)（実機まで無料）。
> Mac が使えない場合は [docs/IOS_VERIFY.md](docs/IOS_VERIFY.md) と
> [docs/IOS_WITHOUT_MAC.md](docs/IOS_WITHOUT_MAC.md)。
>
> **Android**: [docs/DEVICE_SETUP.md](docs/DEVICE_SETUP.md)（EAS でのクラウドビルド）。
>
> Expo CLI はパスに日本語が入っていると起動しないため、
> このリポジトリは `C:\dev\diggr` のような ASCII のパスに置いてください（検証済み）。

```bash
npm install                 # ルートで一度だけ（npm workspaces）

npm run core:test           # ドメイン層のテスト
npm run typecheck           # 全パッケージの型チェック

npm run mobile:start        # Expo を起動（既定はサーバー不要の local モード）
npm run api:dev             # API サーバー（http モードで使うとき）
```

アプリは既定で `EXPO_PUBLIC_API_MODE=local`、つまり `@diggr/core` を端末内で直接呼ぶ。
サーバーを立てずに全画面を触れる。API を使うときは `apps/mobile/.env` に

```
EXPO_PUBLIC_API_MODE=http
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/v1
```

Skia とジェスチャはネイティブモジュールなので、Expo Go ではなく開発ビルド
（`npx expo run:ios` / `run:android`）で確認する。

## 設計上の要点

**二層構造（FR-02）** マップは「確定枠」（類似度 0.60 以上・無料 20 件／Pro 40 件まで）と
その外側で構成する。外側は既定では類似度順の続きで、検索時に**ランダム表示**を選ぶと
41 位以降のプールからの抽選に変わり、引き直し（FR-27）が使えるようになる。
確定枠は同じシードなら常に同じ顔ぶれで、引き直しても動かない。

**マップの同定（FR-02b / ADR-18）** 履歴・ブックマーク・引き直しの単位はマップで、
乱数シードではなく**ノード集合そのもの**を保存する。月次更新でプールの中身が変わっても、
一週間前の履歴が同じ地図で開く。

**段階表示（FR-28）** 初期 10 件、押すごとに +10、長押しで権利範囲を一括。
描画件数を増やすだけで通信は起きず、カメラも動かさない。

**表示タイプ（FR-29）** 「関連アーティスト」は放射状、「同じジャンル」はサブジャンルごとの
島に組み替える。同じジャンル側は関連マップに出た顔ぶれを後ろに回し、
軸を変えた意味が出るようにしている。

**課金（ADR-16）** サブスクリプション 2 種のみ（買い切りは廃止）。権利の正はサーバーで、
アプリは表示を先に進めるためだけに購入結果を使う。

**外部音楽アプリ連携（FR-23）** Spotify / Apple Music / YouTube Music / iTunes Store を
公開 URL で開くだけ。SDK も API キーも規約同意も要らない。

## 実装済みと未実装

実装済み: 検索・マップ生成・二層構造・段階表示・引き直し・表示タイプ切替・
ピンチズームとパン・ラベルの重なり回避・絞り込み（年代／関係タイプ／国）・
詳細シート・外部アプリ連携・チェック済み表示・履歴・設定・ペイウォールの導線・
API サーバーの主要エンドポイント・PostgreSQL スキーマ。

未実装（次の作業）:

- ジャンルパネル（SC-07）と画像共有（SC-14）
- RevenueCat / AdMob の実接続（いまはインターフェイスとスタブのみ）
- 匿名 JWT の発行と保管（`/auth/anonymous` と SecureStore）
- 月次データパイプライン（AWS Batch + DuckDB）と Terraform
- i18n（日本語のみ。文言は各画面に直書き）
- E2E テスト（Maestro）とスクリーンショットテスト

## テストの考え方

ドメイン層（`packages/core`）に判断が集まるようにしてあるので、
「無料は 30 件」「確定枠は毎回同じ」「同じ乱数シードで完全再現」「課金しても引き直さない」
といった仕様は UI を起動せずに検証できる。UI は描画と入力に徹する。
