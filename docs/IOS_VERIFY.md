# iOS の動作確認手順（Mac が使えない場合）

> **Xcode が動く Mac があるなら、この文書は不要。**
> [MAC_SETUP.md](MAC_SETUP.md) の手順のほうが速く、実機確認も無料でできる。
> 以下は Mac が使えない場合の代替経路。

Mac の Xcode が使えない前提で、**費用ゼロで今日できること**から順に並べる。
経路は 3 つあり、上から順に「安い・速い」。

| 経路 | 必要なもの | 費用 | 実機で触れるか |
| --- | --- | --- | --- |
| A. Windows だけで検証 | この PC | 0 円 | ✕（コードの健全性のみ） |
| B. クラウド Mac のシミュレータ | Expo 無料アカウント | 0 円 | △（シミュレータ。Mac が要る） |
| C. 実機（開発ビルド / TestFlight） | Apple Developer Program | 年 14,800 円 | ○ |

---

## 先に確認してほしいこと（Mac の型番と OS）

「Xcode に対応していない」と出たのは、**App Store が最新の Xcode（macOS 14+ が必要）を弾いた**
だけの可能性が高い。**古い Xcode なら入ることがある。** Mac のターミナルで:

```bash
sw_vers
uname -m        # arm64 = Apple Silicon / x86_64 = Intel
```

`ProductVersion` の値で判定する。

| macOS | 入れられる Xcode | この案件で使えるか |
| --- | --- | --- |
| 14.x (Sonoma) 以上 | Xcode 15 / 16 | ○ そのまま使える |
| 13.5〜13.x (Ventura) | **Xcode 15.2**（App Store ではなく [Apple Developer のダウンロード](https://developer.apple.com/download/all/?q=xcode) から。Apple ID 無料登録で取れる） | ○ 使える |
| 12.x (Monterey) | Xcode 14.2 | △ Expo SDK 52 は iOS 15.1+ / Xcode 15 前提。**非推奨** |
| 11.x 以下 | Xcode 13 以前 | ✕ |

**macOS 13.5 以上なら経路 B / C を Mac 単体でこなせる**ので、まずここを確かめてほしい。
ダメだった場合だけ、下の経路 A → C に進む。

---

## 経路 A. Windows だけで検証する（今日・0 円）

iOS 実機がなくても、**落ちる原因の大半はここで潰せる**。
UI コードは Android と完全に共通で、Android 実機では既に動いている。

```powershell
cd C:\dev\diggr

npx vitest run                          # ドメイン層 10 件
npx tsc --noEmit -p packages\core
npx tsc --noEmit -p apps\mobile

cd apps\mobile
npx expo-doctor                         # 18/18
npx expo export --platform ios          # iOS 向け Hermes バンドルを実際に作る
```

`expo export --platform ios` は **iOS 用に本当にバンドルする**ので、

- iOS でしか解決されない import の取りこぼし
- ネイティブモジュールの参照ミス
- Hermes でパースできない構文

がここで落ちる。**実行済みで、4.32 MB のバンドル生成に成功している**（`entry-….hbc`）。

### この経路で確認できないこと

- 描画（Skia）とジェスチャの実際の見え方
- セーフエリア（ノッチ / ホームインジケータ）の余白
- 画面端からのスワイプバック（iOS 固有。Android には無い）
- ハプティクスの強さ
- 日本語フォント（iOS は Hiragino、Android は Noto。**字幅が違うのでラベル配置に効く**）

**つまり iOS 固有の risk はほぼ「レイアウト」に集約される。** ロジックは Android で検証済み。

---

## 経路 B. クラウド Mac のシミュレータで見る（0 円・Mac が要る）

Apple Developer Program **なしで**、EAS のクラウド Mac にシミュレータ用ビルドを作らせる。
署名が要らないので無料アカウントのままで通る。専用プロファイルを用意した。

```powershell
cd C:\dev\diggr\apps\mobile
eas build --profile ios-simulator --platform ios
```

完了すると `.tar.gz`（`DIGGR.app`）のダウンロード URL が出る。
これを **Mac** で展開してシミュレータに入れる:

```bash
tar -xzf build-*.tar.gz
xcrun simctl boot "iPhone 15"        # 起動していなければ
open -a Simulator
xcrun simctl install booted DIGGR.app
xcrun simctl launch booted app.diggr.mobile
```

> `xcrun simctl` は **Xcode 本体ではなく Command Line Tools + シミュレータランタイム**で動く。
> Xcode が App Store から入らない Mac でも、`xcode-select --install` だけで
> シミュレータが使えることがある。試す価値はある。

Windows 側から JS を配信すれば Fast Refresh も効く:

```powershell
npx expo start --dev-client
```

シミュレータ側で `Cmd+Shift+H` → DIGGR を開き、開発サーバーの URL を入力する。

### シミュレータで確認できること・できないこと

| できる | できない |
| --- | --- |
| レイアウト・セーフエリア・フォント字幅 | 実機のフレームレート（Skia は Metal、シミュレータはソフト描画で遅い） |
| スワイプバック（トラックパッドで再現） | ハプティクス |
| ピンチ / パンの挙動（Option ドラッグ） | 外部音楽アプリへの遷移（Spotify 等がシミュレータに無い） |

**100 ノードの描画性能（技術選定書 OI-13）はシミュレータでは判定できない。** 実機が要る。

---

## 経路 C. 実機で動かす（年 14,800 円）

Apple は **実機にアプリを入れる行為そのもの**に署名を要求する。
Windows しか無い状況では、無料 Apple ID の 7 日間署名も使えない（Xcode が要るため）。
したがって実機確認には Apple Developer Program の登録が要る。

### C-0. 登録（初回のみ）

https://developer.apple.com/programs/enroll/

- 個人なら Apple ID + クレジットカードのみ。法人は D-U-N-S 番号が要る
- 審査に **1〜2 営業日**。年 14,800 円（自動更新）
- **Mac は不要**。ブラウザだけで完結する

### C-1. 開発ビルド（Fast Refresh が効く。開発中はこちら）

```powershell
cd C:\dev\diggr\apps\mobile

eas device:create        # ① 端末登録
```

`Website` を選ぶと URL と QR が出る。**iPhone の Safari で開き**、
プロファイルをインストール → 設定 → プロファイルがダウンロード済み → インストール。
これで UDID が Apple に登録される。

```powershell
eas build --profile development --platform ios    # ② ビルド
```

聞かれること:

| 質問 | 答え |
| --- | --- |
| Log in to your Apple account? | **Y**。Apple ID とパスワード、2 ファクタコード |
| Generate a new Apple Distribution Certificate? | **Y** |
| Generate a new Apple Provisioning Profile? | **Y** |
| Select devices | 登録した iPhone にチェック |

15〜25 分で完了。出てきた QR を iPhone で読んで **DIGGR** をインストールする。
以降は Windows 側から:

```powershell
npx expo start --dev-client
```

同じ Wi-Fi なら端末の一覧に出る。出なければ `--tunnel` を足す。
**JS の変更はビルドし直さずに反映される。** 再ビルドが要るのはネイティブ依存を足したときだけ。

### C-2. TestFlight（他人に配る・審査前の最終確認）

```powershell
eas build --profile testflight --platform ios
eas submit --platform ios --latest
```

事前に App Store Connect（https://appstoreconnect.apple.com）でアプリを 1 つ作り、
Bundle ID に **`app.diggr.mobile`** を選ぶ。`eas.json` の `submit.production.ios.ascAppId` に
その App ID を書いておくと以降は聞かれない。

- 内部テスター（自分含む最大 100 人）は**審査なし**で即配布
- 外部テスター（最大 10,000 人）は Beta App Review が要る（半日〜2 日）
- `ITSAppUsesNonExemptEncryption: false` を設定済みなので、輸出コンプライアンスは自動で通る

---

## 実機に届いたら見るところ（iOS 固有）

Android で確認済みの機能は省き、**iOS でだけ壊れうる点**に絞る。

| # | 操作 | 期待する動き | 壊れていたら |
| --- | --- | --- | --- |
| 1 | 起動直後 | 上部のタイトル枠がノッチに被らない | `SafeAreaView` の `edges` |
| 2 | マップ画面の下端 | ボタン列がホームインジケータに被らない | 同上 |
| 3 | 画面左端から右へスワイプ | 前の画面に戻る（iOS 固有） | Expo Router の `gestureEnabled` |
| 4 | ノード名の日本語ラベル | 文字が重ならない。**Hiragino は Noto より字幅が広い** | `placeLabels` の実測幅 |
| 5 | ピンチ / パン | 60fps。指を離した瞬間にラベルが並び直す | Reanimated |
| 6 | ノードをタップ | 詳細シートが出る＋軽い振動 | `expo-haptics` |
| 7 | 「Spotify で開く」 | Spotify アプリが開く（未インストールなら Web） | `LSApplicationQueriesSchemes`（4 件登録済み） |
| 8 | 段階表示を長押しで 100 件まで開く | カクつかない | Skia の描画負荷。OI-13 の判定 |
| 9 | アプリを閉じて再起動 | 履歴とチェック済みが残る | MMKV |
| 10 | 機内モードで起動 | local モードなので全機能が動く | — |

7 番は**シミュレータでは確認できない**（Spotify が入らない）。実機のみ。

---

## 判断

**Apple Developer Program に登録するかどうかは、リリースする気があるかで決まる。**
iOS でリリースするなら遅かれ早かれ必須なので、先に登録して経路 C に進むのが結局いちばん速い。

登録を保留するなら:

1. Mac の `sw_vers` を確認する（macOS 13.5 以上なら Xcode 15.2 が入る）
2. 入らなければ経路 A で健全性だけ担保し、**Android を先にリリースする**
3. iOS は登録後にまとめて確認する

コードは iOS 向けにバンドルできる状態（検証済み）なので、**待っている間に腐ることはない**。
