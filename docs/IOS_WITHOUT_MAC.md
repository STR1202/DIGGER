# Mac 無しで iOS を出す

使用中の Mac が Xcode に対応していないため、**ローカルの Mac は使わない前提**で iOS を進める。
結論として、**iOS の開発ビルドも App Store リリースも Mac 無しで完結できる**。
ビルドは EAS のクラウド macOS が行い、App Store Connect は Web で操作する。

## 何が必要か

| 必要なもの | 費用 | 用途 |
| --- | --- | --- |
| **Apple Developer Program** | **年 14,800 円（99 USD）** | iPhone 実機への配布と App Store 提出に必須 |
| Expo（EAS Build） | 無料枠あり | クラウド macOS でのビルド |
| iPhone 実機 | — | 動作確認 |
| Mac | **不要** | — |

**有料登録は避けて通れない。** 無料 Apple ID でできるのは「Mac の Xcode から 7 日署名で入れる」だけで、
その Mac が使えない以上、iOS を実機で動かす手段は Apple Developer Program のみになる。

登録は Web だけで完結する（https://developer.apple.com/programs/enroll/）。
個人なら本人確認に 24〜48 時間、法人なら D-U-N-S 番号が要るため 1〜2 週間見ておく。

## 進め方の全体像

```
[日常の開発・検証]  Android 実機の開発ビルド  ← いま動いている環境。Fast Refresh で即反映
                            ↓ 機能が固まったら
[iOS の確認]        EAS で iOS ビルド → TestFlight → iPhone で確認
                            ↓
[リリース]          EAS Submit → App Store Connect → 審査 → 公開
```

**iOS の確認は 1 回あたり 20〜40 分**（ビルド＋TestFlight 反映）かかる。
毎回これを回すのは現実的でないので、**日々の作業は Android で行い、iOS は節目で確認する**。
UI は共通コードなので、iOS 固有で差が出るのはセーフエリア・スワイプバック・ハプティクス・
フォントの見え方くらいに限られる。

---

## 経路 A. 開発ビルドを iPhone に入れる（Fast Refresh が効く）

Apple Developer Program の登録が済んでから行う。

### A-1. iPhone の UDID を登録する

```powershell
cd C:\dev\diggr\apps\mobile
eas device:create
```

- 「Website」を選ぶと URL と QR が出る
- **iPhone の Safari** で開き、構成プロファイルをインストール（設定アプリで承認）
- 端末が Apple Developer に登録される

### A-2. ビルド

```powershell
eas build --profile development --platform ios
```

初回に聞かれること:

| 質問 | 答え |
| --- | --- |
| Log in to your Apple account | **Y** → Apple ID・パスワード・二段階認証コード |
| Generate a new Apple Distribution Certificate? | **Y** |
| Generate a new Apple Provisioning Profile? | **Y** |
| 含める端末 | A-1 で登録した iPhone にチェック |

証明書は EAS が暗号化して預かるので、次回以降は聞かれない。

### A-3. インストールと起動

1. 完了時の QR を **iPhone のカメラ**で読む（または URL を Safari で開く）
2. インストール後、**設定 → 一般 → VPN とデバイス管理**で開発者を信頼
3. PC 側で `npx expo start --dev-client` を起動し、iPhone のアプリから接続

これで Android と同じように、コードを保存するだけで iPhone に反映される。

---

## 経路 B. TestFlight で確認する（UDID 登録が不要）

複数人に配る場合や、UDID を集めたくない場合はこちら。
開発ビルドではないので Fast Refresh は効かず、**実際の製品と同じ動きを確認する**用途になる。

### B-1. App Store Connect にアプリを作る

1. https://appstoreconnect.apple.com → マイ App → **＋**
2. プラットフォーム: iOS、名前: DIGGR、バンドル ID: `app.diggr.mobile`、SKU: 任意
3. 作成後、URL に出る 10 桁の数字が **ascAppId**（`eas.json` の `submit.production.ios.ascAppId` に入れておくと自動化できる）

### B-2. ビルドしてアップロード

```powershell
eas build --profile testflight --platform ios
eas submit --platform ios --latest
```

`eas submit` は Apple ID とアプリ用パスワード（App-Specific Password）を聞いてくる。
https://account.apple.com/account/manage で発行する。

### B-3. TestFlight で受け取る

1. App Store Connect → TestFlight → 内部テスターに自分を追加
2. iPhone に **TestFlight** アプリを入れる
3. 数分〜数十分で新しいビルドが届く（内部テストは Apple の審査なし）

---

## 経路 C. App Store へ出す

```powershell
eas build --profile production --platform ios
eas submit --platform ios --latest
```

そのあと App Store Connect で審査に提出する。提出前に埋めるものが残っている。

| 項目 | 現状 |
| --- | --- |
| アプリアイコン（1024×1024） | **未作成**（Expo の既定のまま） |
| スプラッシュ画像 | **未作成** |
| スクリーンショット（6.7 インチ必須） | 未作成。実機かシミュレータで撮る |
| プライバシーポリシーの URL | **未作成**（静的ページを 1 枚用意する必要がある） |
| App Privacy（データ収集の申告） | 未申告。匿名 ID・課金・広告 ID の扱いを申告する |
| 年齢レーティング | 未設定 |
| サポート URL | 未作成 |

審査は初回で 1〜3 日。リジェクトされやすいのは
「Guideline 3.1.1（アプリ内課金の外部誘導）」と「4.2（最小限の機能）」なので、
課金導線はストア標準の API のみを使い、外部決済リンクは日本・米国向けの規定に従うこと
（基本設計書 §3.4 / §9.5 に整理済み）。

---

## いま決めること

1. **Apple Developer Program に登録するか**（年 14,800 円）
   - 登録するなら → 経路 A で iPhone に開発ビルドを入れ、iOS の作業を本格化できる
   - 登録しないなら → iOS は保留。Android を先にリリースし、iOS は後追いにする
2. **Mac を新しくする選択肢があるか**
   - `sw_vers` で macOS のバージョンを確認する。macOS 13.5 以上なら Xcode 15 が入り、
     開発ビルドまではローカルで可能（App Store 提出には Xcode 16 / macOS 14.5 以上が要る）

Android は既に実機で動いているので、**iOS の判断を待つ間も開発は止まらない**。
