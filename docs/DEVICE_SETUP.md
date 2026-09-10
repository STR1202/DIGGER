# 実機で動かす手順（詳細版）

このアプリは **Expo Go では動きません**。Skia（描画）・Reanimated（ジェスチャ）・MMKV（永続化）が
ネイティブモジュールで、Expo Go の実行環境に含まれていないためです。
**「開発ビルド」を 1 度だけ作り、以降は JS だけを配信して開発します。**

所要時間の目安

| 作業 | 時間 |
| --- | --- |
| 手順 0〜1（移動と依存導入） | 10 分 |
| 手順 2（EAS でクラウドビルド） | 15〜25 分（待ち時間込み） |
| 手順 3（端末に入れて起動） | 5 分 |
| 2 回目以降の起動 | 30 秒（`npx expo start --dev-client` のみ） |

事前に確認済みのこと（この端末で実行した結果）

- `expo-doctor`: **18/18 通過**
- `expo export --platform android`: **バンドル生成に成功**（Hermes 4.3 MB）
- `expo prebuild --platform android`: **警告なしで完了**（`newArchEnabled=true` / `hermesEnabled=true` / `applicationId=app.diggr.mobile`）

つまり「アプリのコードが原因でビルドが落ちる」状態ではありません。残りは環境の準備です。

---

## 手順 0. フォルダを ASCII のパスへ移す（必須）

### この手順は完了済み（2026-09-10）

**作業フォルダは `C:\dev\diggr` に移してあります。** 依存の導入と動作確認も済んでいます。
やることは「PowerShell でそこへ移動する」だけです。

```powershell
cd C:\dev\diggr
```

以降のコマンドはすべてこのフォルダで実行します。

### 何が問題だったか

元の場所 `C:\Users\sakat\音楽ディグろうぜ！\diggr` は、**フォルダ名に日本語（と `！`）が
入っています**。Windows の Expo CLI はこれを扱えず、コマンドが何も表示せずに終了コード 1 で
落ちます。同じコードを `C:\dev\diggr` に置くと正常に動くことを確認しました。

| 置き場所 | `expo config` の結果 |
| --- | --- |
| `C:\Users\sakat\音楽ディグろうぜ！\diggr` | 終了コード **1**（失敗・メッセージも出ない） |
| `C:\dev\diggr` | 終了コード **0**（成功） |

「ASCII のパス」とは、**半角英数字と記号だけでできたパス**のことです
（`C:\dev\diggr` は OK、`C:\Users\sakat\音楽ディグろうぜ！\diggr` は NG）。
移すのはこのリポジトリ（`diggr` フォルダ）だけで、設計書や `diggr-demo.html` は
元の場所に置いたままで構いません。

### 元のフォルダはどうするか

`C:\Users\sakat\音楽ディグろうぜ！\diggr` はコピー元としてそのまま残っています。
**今後の編集は `C:\dev\diggr` 側だけに行ってください**（両方に手を入れると内容がずれます）。
不要になったらフォルダごと削除して構いません。

---

## 手順 1. 動くことを確かめる（実行済み・再確認用）

```powershell
cd C:\dev\diggr
npm install     # 済んでいます。やり直す場合のみ
```

次の 3 つが通れば準備完了です。**この 3 つは `C:\dev\diggr` で実行済みで、すべて通っています。**

```powershell
npx vitest run                       # → 10 passed
npx tsc --noEmit -p packages/core    # → 何も出力されなければ成功
cd apps\mobile
npx expo-doctor                      # → 18/18 checks passed
```

`expo-doctor` が落ちる場合は、まず手順 0（ASCII パス）ができているか確認してください。

---

## 手順 2. 開発ビルドを作る

### 2-A. EAS Build（クラウド。Android Studio 不要。**こちらを推奨**）

この PC には JDK も Android SDK も入っていないため、ローカルビルドには
Android Studio と JDK 17 の導入（合計 10 GB 前後）が必要です。クラウドビルドなら不要です。

**① Expo アカウントを作る**（無料）
https://expo.dev/signup

**② EAS CLI を入れてログイン**

```powershell
npm install -g eas-cli
eas login          # メールアドレスとパスワードを入力
eas whoami         # ユーザー名が出ればログイン成功
```

**③ git リポジトリにする**（EAS は git 管理下のファイルをアップロードします）

```powershell
cd C:\dev\diggr
git init
git add -A
git commit -m "initial"
```

**④ プロジェクトを EAS に登録**

```powershell
cd C:\dev\diggr\apps\mobile
eas init
```

- 「Would you like to create a project for @<user>/diggr?」→ **Y**
- `app.json` に `extra.eas.projectId` が自動で書き込まれます（コミットしてください）

**⑤ ビルドを投げる**

```powershell
eas build --profile development --platform android
```

途中で聞かれること:

| 質問 | 答え |
| --- | --- |
| Generate a new Android Keystore? | **Y**（EAS が署名鍵を作って預かります） |
| （既に鍵がある場合）Reuse? | Y |

ビルドはブラウザで進行を見られます。完了すると

- ターミナルに APK の **ダウンロード URL** と **QR コード**
- `https://expo.dev/accounts/<user>/projects/diggr/builds/...` に成果物

が出ます。無料枠は順番待ちが発生することがあります（混雑時 10〜30 分）。

**⑥ 端末に入れる**

1. Android 端末のブラウザで QR を読む（またはダウンロード URL を開く）
2. APK をダウンロード → 「提供元不明のアプリ」の許可を求められたら許可
3. インストール後、**DIGGR** のアイコンが増えます（これが開発ビルド本体）

### 2-B. ローカルビルド（Android Studio を使う場合）

必要なもの:

- **JDK 17**（Temurin 17 推奨。`java -version` で確認）
- **Android Studio** + SDK Platform **35** + Build-Tools + Platform-Tools
- 環境変数 `ANDROID_HOME` = `C:\Users\<user>\AppData\Local\Android\Sdk`
- `Path` に `%ANDROID_HOME%\platform-tools` を追加

```powershell
# 端末を USB 接続し、設定 → 開発者オプション → USB デバッグ を ON
adb devices                 # 端末のシリアルが「device」として出ることを確認

cd C:\dev\diggr\apps\mobile
npx expo run:android        # 初回はネイティブ生成 + Gradle ビルドで 15〜25 分
```

成功すると端末にアプリが入り、そのまま起動します。

> `android/` フォルダは `.gitignore` 済みです。`app.json` を変えたときは
> `npx expo prebuild --clean --platform android` で作り直してください。

---

## 手順 3. 起動して JS を配信する

```powershell
cd C:\dev\diggr\apps\mobile
npx expo start --dev-client
```

- PC と端末を**同じ Wi-Fi** に繋いでおきます
- 端末で DIGGR を開くと、開発サーバーの一覧に出ます。無ければ表示中の QR を読みます
- Wi-Fi が使えない環境では `npx expo start --dev-client --tunnel`（少し遅くなります）

ターミナルのキー操作

| キー | 動作 |
| --- | --- |
| `r` | 再読み込み |
| `j` | デバッガを開く（Chrome DevTools） |
| `m` | 端末側の開発メニューを開く |
| `shift + m` | Metro の詳細メニュー |

コードを保存すると Fast Refresh で即反映されます。ネイティブ依存を足したときだけ、
手順 2 のビルドをやり直す必要があります。

---

## 手順 4. 起動後に見るところ

| 操作 | 期待する動き | 関連 |
| --- | --- | --- |
| 検索 → 「Radiohead」 → 候補をタップ | 中心に人アイコン＋紫のグロー、周囲に **10 件だけ** 出る | FR-28 |
| 「＋ さらに 10 件」を押す | 10 件ずつ増える。**カメラは動かない**。ボタン下の進捗バーが伸びる | FR-28 |
| 同じボタンを長押し | 権利範囲（無料 30 件）まで一気に開く | FR-28 |
| 30 件開いた状態 | 同じ位置のボタンが「🔒 もっとディグる（＋70）」に変わる | §5.2 |
| ピンチ / ドラッグ | 60fps で追従。**指を離した瞬間にラベルが並び直す** | FR-04 |
| ノードをタップ | 詳細シートが出る。閉じるとノード右上に白いチェックが付く | SC-06 |
| ノードをダブルタップ | そのアーティストを中心に地図が組み直される | FR-05 |
| 上部「同じジャンル」 | サブジャンルの島に組み替わる。**中心アイコンは人のまま** | FR-29 |
| 検索画面で「ランダム表示」を ON にしてから掘る | ⋮ の 🎲 引き直しが有効になる | FR-27 |
| 「絞込」→ 関係タイプを選んで適用 | 対象だけがアクセント色で脈打ち、対象外は沈む | SC-16 |
| 設定 →「アニメーションを軽減」 | 呼吸が止まる | §7 |

### 100 ノード（Pro 相当）で確認するには

技術選定書 OI-13 の「実機で 100 ノードの描画性能を検証する」に相当します。

`apps/mobile/src/api/local.ts` の `LocalApi` に `setPlan` があるので、
`src/api/index.ts` の末尾に一時的に次を足してから起動します。

```ts
localApi?.setPlan('pro_yearly');   // 検証用。コミットしないこと
```

そのうえで段階表示ボタンを長押しすると 100 件まで一度に開きます。
Metro のターミナルで `j` を押し、Performance タブでフレーム落ちを見てください。

---

## 手順 5. API サーバーに繋ぐ場合（任意）

既定はサーバー不要の `local` モードです。実サーバーを見るときだけ設定します。

```powershell
# PC 側
cd C:\dev\diggr
npm run api:dev            # http://localhost:8080

# PC の LAN IP を調べる
ipconfig                   # 例: 192.168.1.10
```

`apps/mobile/.env` を作成:

```
EXPO_PUBLIC_API_MODE=http
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8080/v1
```

**実機からは `localhost` は端末自身を指す**ので、必ず PC の LAN IP を書きます。
`.env` を変えたら `npx expo start --dev-client -c`（キャッシュクリア）で入れ直します。

---

## 手順 6. iOS で確認したい場合

**Windows から iOS の実機ビルドはできません。**

| 状況 | 方法 |
| --- | --- |
| Mac がある | `npx expo run:ios --device`（Xcode 15+、無料 Apple ID なら 7 日間有効な署名） |
| Mac が無い | `eas build --profile development --platform ios` は可能。ただし実機導入に **Apple Developer Program（年 99 USD）** の登録と端末 UDID の登録が必要 |

Android で描画とジェスチャを確認しておけば、iOS 固有で問題になりやすいのは
セーフエリアとハプティクス程度です。

---

## 詰まったときの対処

| 症状 | 原因と対処 |
| --- | --- |
| `expo` コマンドが即エラー終了する | パスに日本語。手順 0 を実施 |
| `The required package expo-asset cannot be found` | ワークスペースのホイスティング崩れ。`npm install` をやり直す（`expo-asset` などはアプリの依存として明示済み） |
| Metro が `@diggr/core` を解決できない | `apps/mobile/metro.config.js` の `watchFolders` を確認。`npx expo start -c` でキャッシュを消す |
| 画面が真っ黒のまま | Skia の無い Expo Go で開いている。DIGGR（開発ビルド）から起動する |
| 起動直後に MMKV で落ちる | 新アーキテクチャが必要。`app.json` の `newArchEnabled: true` を確認 |
| ジェスチャが効かない | `app/_layout.tsx` の `GestureHandlerRootView` が最上位にあるか確認 |
| 端末が開発サーバーを見つけない | 同じ Wi-Fi か確認 →ダメなら `--tunnel` |
| `adb devices` に出ない | USB デバッグ未許可、またはケーブルが充電専用。端末側のダイアログで「このパソコンを許可」 |
| EAS ビルドが `git` エラーで止まる | 手順 2-A ③ のコミットが未実施 |
| ビルドは通るが端末でインストールできない | 「提供元不明のアプリ」の許可、または端末のストレージ不足 |

ログの取り方

```powershell
npx expo start --dev-client        # JS 側のエラーはここに出る
adb logcat *:E                     # ネイティブのクラッシュはこちら
```

---

## 配布まで進めるとき

```powershell
eas build --profile preview    --platform android   # 社内配布用 APK
eas build --profile production --platform android   # Play 用 AAB
eas submit --platform android
```

`production` プロファイルは `EXPO_PUBLIC_API_MODE=http` を渡すので、本番ビルドは実 API を見ます。
ストア提出には、まだ用意していないもの（アイコン・スプラッシュ画像・プライバシーポリシー URL・
データ収集の申告・年齢レーティング）が必要です。
