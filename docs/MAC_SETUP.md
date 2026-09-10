# Mac で iOS の動作確認をする手順

Xcode が使える Mac がある前提。**この経路がいちばん速く、いちばん安い。**

- シミュレータ: **無料**、Apple ID すら不要
- 実機: **無料 Apple ID で 7 日間有効な署名**が使える。Apple Developer Program（年 14,800 円）は**不要**
- 有料登録が要るのは TestFlight と App Store 提出のときだけ

Windows 側の作業は GitHub（`https://github.com/STR1202/DIGGER`）に push 済み。
Mac ではこれを clone して動かす。

所要時間の目安

| 作業 | 時間 |
| --- | --- |
| 手順 1（前提の確認） | 5 分 |
| 手順 2（clone と依存導入） | 5 分 |
| 手順 3（シミュレータで起動） | 初回 10〜20 分、2 回目以降 1 分 |
| 手順 4（実機で起動） | +10 分 |
| 以降の開発 | 30 秒（`npm run dev` のみ） |

---

## 手順 1. 前提を確認する

ターミナルで次を順に実行し、出力を確かめる。

```bash
xcodebuild -version      # Xcode 15.3 以上
node -v                  # v20 以上（package.json の engines が >=20）
xcrun simctl list devices available | grep iPhone   # シミュレータが 1 つ以上
```

### Xcode のバージョンについて

Expo SDK 52 / React Native 0.76.9 を新アーキテクチャで動かす。

| Xcode | 判定 |
| --- | --- |
| 16.x | ○ 推奨 |
| 15.3〜15.4 | ○ 動く |
| 15.0〜15.2 | △ 動くが pod install で警告が出ることがある |
| 14.x 以下 | ✕ ビルドが通らない |

初回のみ、ライセンス同意と CLI パスの設定が要る。

```bash
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcode-select --install          # 既に入っていれば「already installed」と出る。正常
```

### Node が無い / 古い場合

```bash
# Homebrew（未導入なら）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node@20
node -v
```

`node -v` が古いままなら、PATH に `node@20` を通す（Apple Silicon の場合）。

```bash
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Intel Mac では `/opt/homebrew` を `/usr/local` に読み替える。

### CocoaPods

**入れなくてよい。** Expo SDK 52 の `expo run:ios` は同梱の CocoaPods を使うため、
`pod` コマンドが無くても動く。既に入っている場合だけ `pod --version` が 1.13 以上か見ておく。

---

## 手順 2. clone して依存を入れる

```bash
cd ~
git clone https://github.com/STR1202/DIGGER.git diggr
cd diggr
npm install
```

`npm install` は npm workspaces なのでルートで 1 回だけ。600 パッケージほど入る（3〜5 分）。

> **パスに日本語を入れないこと。** Windows では `音楽ディグろうぜ！` フォルダに置いたせいで
> Expo CLI が起動しなかった。Mac では起きにくいが、`~/diggr` のような ASCII のパスが安全。

### 依存が入ったことを確かめる

```bash
npm test                      # → 10 passed（ドメイン層）
npm run typecheck             # → 3 パッケージとも無出力なら成功

cd apps/mobile
npx expo-doctor               # → 18/18 checks passed
```

ここまで通ればコードの側に問題は無い。Windows でも同じ結果を確認済み。

---

## 手順 3. シミュレータで起動する

```bash
cd ~/diggr/apps/mobile
npm run ios
```

この 1 コマンドで、次が順に走る。

1. `expo prebuild` — `ios/` を生成（`.gitignore` 済みなのでリポジトリには入っていない）
2. `pod install` — ネイティブ依存の解決（初回 3〜8 分）
3. `xcodebuild` — アプリのビルド（初回 5〜15 分。Skia のコンパイルが重い）
4. シミュレータを起動してインストールし、Metro を立ち上げる

**初回だけ時間がかかる。2 回目以降は 1 分ほど。**

機種を選びたいときは:

```bash
npm run ios -- --device "iPhone 16 Pro"
```

### 2 回目以降の開発

ネイティブ依存を足していなければ、ビルドし直す必要はない。

```bash
cd ~/diggr/apps/mobile
npm run dev          # expo start --dev-client
```

シミュレータで `i` を押すか、DIGGR を直接開く。コードを保存すると Fast Refresh で即反映される。

| キー | 動作 |
| --- | --- |
| `i` | シミュレータで開く |
| `r` | 再読み込み |
| `j` | デバッガ（Chrome DevTools） |
| `m` | 開発メニュー |

### シミュレータでのジェスチャ操作

| やりたいこと | 操作 |
| --- | --- |
| ピンチイン / アウト | **Option** を押しながらドラッグ |
| パン | そのままドラッグ |
| スワイプバック | 画面左端から右へドラッグ |
| ホームに戻る | `Cmd + Shift + H` |
| 回転 | `Cmd + →` |

### シミュレータで確認できないこと

- **フレームレート**。Skia は実機で Metal、シミュレータはソフト描画で必ず遅い。
  100 ノードの描画性能（技術選定書 OI-13）は**実機でしか判定できない**
- ハプティクス（振動）
- 外部音楽アプリへの遷移。Spotify などがシミュレータに入らないため Web にフォールバックする

---

## 手順 4. 実機（iPhone）で起動する

**無料の Apple ID で足りる。** 有料登録は不要。ただし署名が 7 日で切れるので、
期限が来たら `npm run ios:device` をやり直す（アプリのデータは残る）。

### 4-1. Xcode に Apple ID を登録する（初回のみ）

1. Xcode → **Settings**（`Cmd + ,`）→ **Accounts** タブ
2. 左下の **＋** → **Apple ID** → 普段の Apple ID でサインイン
3. 一覧に `(Personal Team)` が出れば成功

### 4-2. iPhone を繋いでデベロッパモードにする

1. USB で Mac に接続。iPhone 側の「このコンピュータを信頼しますか？」で **信頼**
2. iPhone: **設定 → プライバシーとセキュリティ → デベロッパモード** を **ON** → 再起動

> デベロッパモードの項目は、Xcode から一度何かを入れようとするまで出てこないことがある。
> 見当たらなければ先に 4-4 を実行し、失敗してから設定を見る。

### 4-3. 署名チームを設定する（初回のみ）

```bash
cd ~/diggr/apps/mobile
npx expo prebuild --platform ios     # ios/ が無ければ生成
open ios/DIGGR.xcworkspace
```

Xcode で:

1. 左のツリーで一番上のプロジェクト名をクリック
2. **TARGETS → DIGGR** を選ぶ
3. **Signing & Capabilities** タブ
4. **Automatically manage signing** にチェック
5. **Team** で `(Personal Team)` を選ぶ

> **Bundle Identifier が衝突したら**（"is not available" と出る場合）
> `app.diggr.mobile` を誰かが既に使っている。`app.diggr.mobile.taiyo` のように末尾を足して一意にする。
> これは実機確認用のローカルな変更なので、**`app.json` は書き換えず、コミットもしない**。

### 4-4. 実機で起動する

```bash
cd ~/diggr/apps/mobile
npm run ios:device
```

接続中の iPhone が一覧に出るので選ぶ。ビルドが終わると自動でインストールされる。

**初回は起動時に「信頼されていないデベロッパ」と出る。**
iPhone: **設定 → 一般 → VPN とデバイス管理 → 自分の Apple ID → 信頼** を押してから開き直す。

### 4-5. ケーブルを抜いて開発する

Mac と iPhone が同じ Wi-Fi にあれば、以降はケーブル不要。

```bash
npm run dev
```

iPhone で DIGGR を開くと開発サーバーの一覧に出る。出なければ表示中の QR を読む。
Wi-Fi が使えない環境では `npx expo start --dev-client --tunnel`（少し遅い）。

---

## 手順 5. 起動後に見るところ

### 5-1. Android で直した 5 点の確認（最優先）

Windows 側で直した内容が iOS でも効いているかを見る。

| # | 操作 | 期待する動き |
| --- | --- | --- |
| 1 | マップ画面のボタン列 | **「ジャンル N」ボタンがある**（N はそのマップのジャンル数）。押すとジャンルパネルが出る |
| 2 | 同じボタン列 | 「全体表示」ボタンが**無い**。並びは ジャンル / 絞込 / 中心に戻る の 3 つ。全体表示は**空白部分のダブルタップ**に移した |
| 3 | ノードをタップ → シートを閉じる | ノード右上の**白い丸の中にチェックが描かれる**（丸だけで中身が空、にならない） |
| 4 | ピンチイン / アウトの最中 | **アーティスト名が消えない**。指の動きにラベルが追従して拡大縮小する |
| 5 | マップを動かしてから「中心に戻る」 | ラベルが**カメラと一緒に滑らかに戻る**。先にワープして待っている、にならない |

### 5-2. iOS 固有の確認

Android で検証済みの機能は省き、**iOS でだけ壊れうる点**に絞る。

| # | 操作 | 期待する動き | 壊れていたら見る場所 |
| --- | --- | --- | --- |
| 6 | 起動直後 | 上部のタイトル枠がノッチ / Dynamic Island に被らない | `SafeAreaView` の `edges` |
| 7 | マップ画面の下端 | ボタン列がホームインジケータに被らない | 同上 |
| 8 | 画面左端から右へスワイプ | 前の画面に戻る（**iOS 固有。Android には無い**） | Expo Router の `gestureEnabled` |
| 9 | 日本語のアーティスト名 | 文字が重ならない。**iOS は Hiragino、Android は Noto で字幅が違う** | `packages/core/src/labels.ts` の実測幅 |
| 10 | ノードをタップ | 詳細シートと同時に軽い振動（**実機のみ**） | `expo-haptics` |
| 11 | 「Spotify で開く」 | Spotify アプリが開く。未インストールなら Safari（**実機のみ**） | `app.json` の `LSApplicationQueriesSchemes`（4 件登録済み） |
| 12 | アプリを終了して再起動 | 履歴とチェック済みが残っている | MMKV |
| 13 | 機内モードで起動 | 既定は local モードなので全機能が動く | — |

### 5-3. 100 ノードの描画性能（OI-13。実機のみ）

技術選定書の残課題「実機で 100 ノードの描画性能を検証する」に相当する。

`apps/mobile/src/api/index.ts` の末尾に一時的に足す:

```ts
localApi?.setPlan('pro_yearly');   // 検証用。コミットしないこと
```

そのうえで段階表示ボタンを**長押し**すると 100 件まで一度に開く。
計測は Release ビルドで行う（Debug は JS が遅く、判定にならない）。

```bash
npm run ios:release -- --device
```

Xcode の **Product → Profile**（`Cmd + I`）→ **Animation Hitches** で
ピンチ / パン中のフレーム落ちを見る。

---

## 詰まったときの対処

| 症状 | 原因と対処 |
| --- | --- |
| `pod install` が失敗する | `cd ios && pod repo update && cd ..` の後、`npx expo prebuild --clean --platform ios` |
| ビルドが謎のエラーで落ちる | まず `ios/` を作り直す: `npx expo prebuild --clean --platform ios`。`ios/` は `.gitignore` 済みなので消して問題ない |
| それでも落ちる | `rm -rf ~/Library/Developer/Xcode/DerivedData` |
| `The required package expo-asset cannot be found` | ワークスペースのホイスティング崩れ。ルートで `rm -rf node_modules && npm install` |
| Metro が `@diggr/core` を解決できない | `npx expo start --dev-client -c`（キャッシュクリア） |
| 画面が真っ黒 | Expo Go で開いている。**Expo Go では動かない**（Skia / MMKV / Reanimated がネイティブ）。DIGGR アプリから開く |
| 起動直後に MMKV で落ちる | 新アーキテクチャが必要。`app.json` の `newArchEnabled: true` を確認 |
| ジェスチャが効かない | `app/_layout.tsx` の `GestureHandlerRootView` が最上位にあるか |
| `Untrusted Developer` | 設定 → 一般 → VPN とデバイス管理 → 自分の Apple ID → 信頼 |
| `Failed to register bundle identifier` | 4-3 の通り Bundle ID の末尾を変えて一意にする |
| 7 日経ってアプリが起動しなくなった | 無料署名の期限切れ。`npm run ios:device` をやり直す |
| 実機が一覧に出ない | ケーブルが充電専用 / デベロッパモードが OFF / 「信頼」を押していない |
| ポート 8081 が使われている | `npx expo start --dev-client --port 8082` |

ログの取り方

```bash
npm run dev                    # JS のエラーはここに出る
npx react-native log-ios       # ネイティブ側のログ
```

Xcode でビルドエラーの詳細を見るときは `open ios/DIGGR.xcworkspace` して `Cmd + B`。

---

## API サーバーに繋ぐ場合（任意）

既定はサーバー不要の `local` モード。実サーバーを見るときだけ設定する。

```bash
cd ~/diggr
npm run api:dev                # http://localhost:8080
ipconfig getifaddr en0         # Mac の LAN IP。例 192.168.1.10
```

`apps/mobile/.env` を作る:

```
EXPO_PUBLIC_API_MODE=http
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8080/v1
```

**実機からは `localhost` は iPhone 自身を指す**ので、必ず Mac の LAN IP を書く。
シミュレータなら `localhost` のままでよい。`.env` を変えたら `npm run dev -- -c` で入れ直す。

---

## この先（配布まで進めるとき）

ここから先は **Apple Developer Program（年 14,800 円）が要る**。

```bash
cd ~/diggr/apps/mobile

# TestFlight（内部テスターは審査なしで即配布）
eas build --profile testflight --platform ios
eas submit --platform ios --latest
```

事前に App Store Connect でアプリを 1 つ作り、Bundle ID に `app.diggr.mobile` を選ぶ。
`ITSAppUsesNonExemptEncryption: false` は設定済みなので、輸出コンプライアンスの質問は自動で通る。

Mac があるので EAS のクラウドビルドは必須ではないが、
**バージョン採番と TestFlight 提出は EAS 経由のほうが楽**（`autoIncrement` が効く）。

ストア提出には、まだ用意していないものがある。

- アイコン / スプラッシュ画像の最終版
- プライバシーポリシー URL
- App プライバシー（データ収集）の申告
- 年齢レーティング
- スクリーンショット（6.7 インチ / 6.5 インチ必須）
