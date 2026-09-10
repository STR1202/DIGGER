# 動作確認のやり方

確認の手段は 4 段ある。**下に行くほど手間がかかるので、上から順に使う**。
「直した内容がどの層に属するか」で、どこまで確認すればよいかが決まる。

| 層 | 何を確かめられるか | 所要時間 | 端末 |
| --- | --- | --- | --- |
| ① ドメイン層のテスト | 仕様（件数・確定枠・再現性・課金時の挙動） | 1 秒 | 不要 |
| ② 型チェックとバンドル | 壊れた参照・構文・import 漏れ | 10〜60 秒 | 不要 |
| ③ API を直接叩く | サーバー側のマップ生成・引き直し | 10 秒 | 不要 |
| ④ Android 実機 | 見た目・触り心地・性能 | 30 秒（初回のビルド後） | Android |

---

## ① ドメイン層のテスト（まずこれ）

マップ生成・二層構造・乱数の再現性など、**仕様そのものは端末なしで検証できる**。
UI に触らない変更（`packages/core` 配下）は、ここが通れば実機を見る必要はない。

```powershell
cd C:\dev\diggr
npx vitest run
```

期待する出力

```
✓ packages/core/src/__tests__/map.test.ts (8 tests)
✓ packages/core/src/__tests__/layout.test.ts (2 tests)
Tests  10 passed (10)
```

いま検証している内容:

- 無料は 30 件・確定枠は 20 件まで／Pro は 100 件
- ランダム表示 OFF なら毎回同じ地図（既定）
- ランダム表示 ON で確定枠は据え置き、外側だけ変わる
- 同じ乱数シードなら完全に再現できる（FR-02b）
- 確定枠のスコアは 0.60 以上
- 同じジャンルの地図は関連の顔ぶれを避け、島に分かれる
- 課金しても引き直さず、見えていたノードは残る（UC-02）
- ノードが中心と重ならず、画面に収まる倍率が出る
- ラベルが重ならず、拡大すると表示数が増える

仕様を変えたら、**先にここのテストを直してから実装する**と手戻りが少ない。

## ② 型チェックとバンドル

```powershell
cd C:\dev\diggr
npx tsc --noEmit -p packages/core       # 何も出なければ成功
npx tsc --noEmit -p services/api
npx tsc --noEmit -p apps/mobile

cd apps\mobile
npx expo export --platform android --output-dir ..\..\.tmp-export
```

`expo export` は Metro を通して実際にバンドルを作るので、
**import 漏れ・存在しないコンポーネント・構文エラーはここで必ず出る**。
`android bundles (1)` と出れば成功（出力フォルダは消してよい）。

## ③ API を直接叩く

サーバー側だけを見たいときはこれが速い。

```powershell
# ターミナル 1
cd C:\dev\diggr
npm run api:dev

# ターミナル 2
curl http://localhost:8080/health
curl -X POST http://localhost:8080/v1/maps ^
  -H "Authorization: Bearer dev" -H "Content-Type: application/json" ^
  -d "{\"seedType\":\"artist\",\"seedKey\":\"mock-0000\",\"viewType\":\"related\",\"randomOn\":false}"
```

`mock-0000` は Radiohead。確定枠 16 件＋外側 14 件＝30 件、未解放 70 件が返る。

## ④ Android 実機（いま最速の見た目確認）

**開発ビルドは端末に入ったままなので、再ビルドは不要。** Metro を起動して読み込み直すだけ。

```powershell
cd C:\dev\diggr\apps\mobile
npx expo start --dev-client
```

1. PC と Android 端末を**同じ Wi-Fi** に繋ぐ
2. 端末の **DIGGR** を開く（開発サーバーの一覧に出る。無ければ表示中の QR を読む）
3. すでに開いている場合は、端末を振る → **Reload**、または PC のターミナルで `r`

### 再ビルドが要るとき / 要らないとき

| 変更した内容 | 対応 |
| --- | --- |
| 画面・ロジック・スタイル（`app/` `src/` `packages/core/`） | **リロードのみ** |
| `package.json` に**ネイティブ依存**を追加した | `eas build` からやり直し |
| `app.json` のプラグイン・権限・アイコン | 同上 |
| `.env`（`EXPO_PUBLIC_*`） | Metro を `-c` 付きで再起動 |

---

## 直近の修正（5 点）の確認表

| 操作 | 期待する動き |
| --- | --- |
| 下部のボタン列 | **「ジャンル N」「絞込」「中心に戻る」の 3 つ**。「全体表示」は無い |
| 「ジャンル N」をタップ | 階層ツリーが出る。▸ で開閉、タップでハイライト（対象が脈打ち、対象外が沈む） |
| ジャンルを選んで「このジャンルを掘る」 | サブジャンルの島に組み替わった地図へ遷移 |
| ノードをタップ → シートを閉じる | ノード右上の**白丸の中にレ点**。外部アプリで聴いた後は緑丸 |
| ピンチで拡大縮小 | **最中もアーティスト名が付いて動く**。指を離すと重なり回避で置き直る |
| 地図を動かして「中心に戻る」 | 地図とラベルが**一体のまま**中心へ戻る |
| 空白をダブルタップ | 全体が入る倍率に戻る |

## 100 ノードでの性能を見る

`apps/mobile/src/api/index.ts` の末尾に一時的に足す。

```ts
localApi?.setPlan('pro_yearly');   // 検証用。コミットしないこと
```

段階表示ボタンを長押しすると 100 件まで一気に開く。
Metro のターミナルで `j` を押すと Chrome DevTools が開き、Performance でフレーム落ちを見られる。

## デザインだけ見たいとき

`prototype/diggr-demo.html` をブラウザで開くと、仕様確認用の HTML デモが動く。
アプリのコードとは別物だが、画面設計の意図（どう見えるべきか）の基準として使える。
