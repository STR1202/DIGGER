# E2E（Maestro）

`packages/core` のテストは仕様の判断ロジックを検証するが、実機での操作フロー
（タップ・遷移・文言の可視性）はカバーしない。ここは [Maestro](https://maestro.mobile.dev/)
でそれを補う出発点。

## 現状

3 本のフローを用意した（テキストベースの選択なので、testID の付与は不要だが、
文言を変えたら追随が必要になる）。

- `01-onboarding.yaml` — SC-02 初回起動 → 音楽アプリ選択 → 検索画面
- `02-first-dig.yaml` — UC-01 検索 → マップ表示 → 段階表示
- `03-paywall.yaml` — UC-02 の入口。Free 上限到達 → ペイウォール → 法務リンクの可視性

## 実行方法（開発ビルドが必要）

Expo Go では Skia・SQLite 等のネイティブモジュールが動かないため、
必ず開発ビルド（`npx expo run:ios` / `run:android`、または EAS の `development` プロファイル）
の実機・シミュレータに対して実行する。

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro test e2e/maestro/01-onboarding.yaml
```

## まだ無いもの

- CI（GitHub Actions）への組み込み。実機/シミュレータ起動環境の用意が要るため、
  `本番リリース計画書` の S0（社内アルファ、実機 3 機種）のタイミングで手動実行から始め、
  安定したら Maestro Cloud 等の CI 連携を検討する。
- スクリーンショットテスト（設計書が明言する非機能要件「ラベルが倍率 3.0 まで拡大すれば
  読める」等の視覚回帰）は未着手。
