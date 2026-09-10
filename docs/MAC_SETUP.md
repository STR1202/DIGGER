# Mac で確認する手順

Windows 側の作業は GitHub（`https://github.com/STR1202/DIGGER`）に push 済みです。
Mac ではそれを clone して動かします。**シミュレータなら Apple の有料登録は不要**、
実機も無料 Apple ID で 7 日間有効な署名が使えます。

所要時間の目安

| 作業 | 時間 |
| --- | --- |
| 手順 1（開発環境の用意） | 30〜60 分（Xcode のダウンロードが大半） |
| 手順 2（clone と依存導入） | 5 分 |
| 手順 3（シミュレータで起動） | 初回 10〜20 分、2 回目以降 1 分 |
| 手順 4（実機で起動） | +10 分 |

---

## 手順 1. 開発環境を用意する

### 1-1. Xcode（必須）

App Store から **Xcode 16 以上** を入れます（15 GB ほど、回線次第で 30〜60 分）。
入れ終えたら一度起動して使用許諾に同意し、続けてターミナルで:

```bash
xcode-select --install                                   # Command Line Tools
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version                                      # Xcode 16.x と出れば OK
```

### 1-2. Homebrew と Node

```bash
# Homebrew（未導入なら）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node watchman cocoapods git
node -v        # v20 以上であること（このリポジトリは Node 20+ が前提）
pod --version  # 1.15 以上
```

`watchman` はファイル監視を安定させるためのもので、無くても動きますが入れておくと
Metro の取りこぼしが減ります。`cocoapods` は iOS のネイティブ依存を入れるのに必須です。

---

## 手順 2. リポジトリを取得する

```bash
cd ~/dev            # 好きな場所で。パスに日本語や記号を含めないこと
git clone https://github.com/STR1202/DIGGER.git
cd DIGGER
npm install         # 1000 パッケージほど、3〜5 分
```

動くことの確認（ここまでで iOS ビルド無しに検証できます）:

```bash
npx vitest run                       # → 10 passed
npx tsc --noEmit -p packages/core    # → 出力が無ければ成功
cd apps/mobile && npx expo-doctor    # → 18/18 checks passed
```

---

## 手順 3. シミュレータで起動する（署名不要・まずはこちら）

```bash
cd ~/dev/DIGGER/apps/mobile
npx expo run:ios
```

初回に起きること（10〜20 分）:

1. `ios/` フォルダが生成される（`prebuild`。`.gitignore` 済みなのでコミットされません）
2. `pod install` が走る
3. Xcode がビルドし、シミュレータが自動で立ち上がってアプリが起動する

2 回目以降は起動だけなら次で足ります。

```bash
npx expo start --dev-client
# ターミナルで i を押すとシミュレータで開く
```

シミュレータでのピンチ操作は **`option` キーを押しながらドラッグ**です
（2 本指の中点が画面中央に固定されます）。パンは普通にドラッグです。

---

## 手順 4. iPhone 実機で起動する

### 4-1. 接続と署名

1. iPhone を USB で接続し、iPhone 側の「このコンピュータを信頼しますか？」で **信頼**
2. iPhone の 設定 → プライバシーとセキュリティ → **デベロッパモード** を ON（再起動を求められます）
3. Xcode で署名チームを設定します

```bash
cd ~/dev/DIGGER/apps/mobile
npx expo prebuild --platform ios     # ios/ が無ければ生成
open ios/DIGGR.xcworkspace           # .xcodeproj ではなく .xcworkspace を開く
```

Xcode の左ペインで **DIGGR** を選び、**Signing & Capabilities** タブで:

- **Automatically manage signing** にチェック
- **Team** に自分の Apple ID を選ぶ（無い場合は Xcode → Settings → Accounts で Apple ID を追加）

無料 Apple ID の場合、ここで `Failed to register bundle identifier` が出ることがあります。
その時は **Bundle Identifier** を `app.diggr.mobile.あなたの名前` のように一意な値へ変えてください
（`app.json` の `ios.bundleIdentifier` も同じ値に直しておくと、次回の prebuild でも保たれます）。

### 4-2. 起動

```bash
npx expo run:ios --device
```

接続中の端末が一覧に出るので選びます。インストール後、初回だけ iPhone 側で:

**設定 → 一般 → VPN とデバイス管理 → デベロッパApp → 自分の Apple ID → 信頼**

を実行してからアプリを開きます。

> 無料 Apple ID の署名は **7 日で失効**します。切れたら `npx expo run:ios --device` を
> もう一度実行すれば入れ直せます。期限を気にせず配りたい場合は
> Apple Developer Program（年 99 USD）に加入し、EAS Build か TestFlight を使います。

---

## 手順 5. 何を確認するか

今回直した 5 点を中心に見てください。

| 操作 | 期待する動き | 今回の修正 |
| --- | --- | --- |
| 検索 → Radiohead → 掘る | 中心に人アイコン、周囲に 10 件 | — |
| 下部のボタン列 | **「ジャンル N」「絞込」「中心に戻る」の 3 つ**。「全体表示」は無い | ①② |
| 「ジャンル N」をタップ | 階層ツリーが出る。▸ で子ジャンルを開閉、タップでハイライト | ① |
| ジャンルを選んで「このジャンルを掘る」 | サブジャンルの島に組み替わった地図へ | ① |
| ノードをタップ→シートを閉じる | ノード右上の**白丸の中にレ点**が付く。外部アプリで聴いた後は緑丸 | ③ |
| ピンチ（option＋ドラッグ／2 本指） | **拡大縮小の最中もアーティスト名が付いて動く**。指を離すと重なり回避で置き直る | ④ |
| 地図を動かしてから「中心に戻る」 | 地図とラベルが**一体のまま**中心へ戻る（ラベルだけ先に飛ばない） | ⑤ |
| 空白をダブルタップ | 全体が入る倍率に戻る | ② |
| 「＋ さらに 10 件」長押し | 権利範囲まで一気に開く。カメラは動かない | — |
| 検索画面の「ランダム表示」ON → 掘る | ⋮ の 🎲 引き直しが有効になる | — |

**100 ノードでの描画性能**（技術選定書 OI-13）を見るときは、
`apps/mobile/src/api/index.ts` の末尾に一時的に次を足してから起動します。

```ts
localApi?.setPlan('pro_yearly');   // 検証用。コミットしないこと
```

Xcode の Debug navigator（実行中に ⌘6）で FPS とメモリを見られます。

---

## 手順 6. 変更を Windows 側と共有する

```bash
git pull                     # Windows で直した分を取り込む
# 修正して
git add -A
git commit -m "fix: ..."
git push
```

Mac と Windows のどちらで作業しても構いませんが、**同じブランチを両方で同時に触らない**
ようにしてください。`ios/` と `android/` は生成物なので Git には入りません。

---

## 詰まったときの対処

| 症状 | 対処 |
| --- | --- |
| `pod install` が失敗する | `cd ios && pod repo update && pod install`。それでも駄目なら `rm -rf ios && npx expo prebuild --clean --platform ios` |
| `xcrun: error: unable to find utility` | `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| `No bundle URL present` | Metro が落ちている。別ターミナルで `npx expo start --dev-client`、アプリを再起動 |
| シミュレータが見つからない | Xcode → Settings → Platforms で iOS のシミュレータランタイムを入れる |
| `Failed to register bundle identifier` | 無料アカウントの制限。Bundle Identifier を一意な値に変える（4-1 参照） |
| 実機に「信頼されていないデベロッパ」と出る | 設定 → 一般 → VPN とデバイス管理 → 信頼 |
| ポート 8081 が使用中 | `npx expo start --dev-client --port 8082`、または `lsof -ti:8081 \| xargs kill` |
| Metro が `@diggr/core` を見つけない | `npx expo start -c` でキャッシュを消す |
| 起動直後に落ちる | `npx react-native log-ios` か Xcode の Console でネイティブ側のログを見る |
| ビルドは通るが画面が真っ白 | Metro のターミナルに JS エラーが出ていないか確認。`r` で再読み込み |

---

## 補足：EAS を使う場合（Mac 不要の経路）

Mac が手元にあるなら手順 3〜4 が最短ですが、配布まで見据えるなら EAS も使えます。

```bash
eas build --profile development --platform ios   # 実機用。Apple Developer Program が必要
eas device:create                                 # 端末の UDID 登録（同上）
```

無料 Apple ID では EAS の実機ビルドはできません（プロビジョニングプロファイルが作れないため）。
Mac での `expo run:ios --device` なら無料アカウントで動きます。
