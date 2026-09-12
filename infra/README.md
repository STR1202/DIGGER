# infra/

本番環境（Plan B: VPS 1 台、技術選定書 §9.1）の構成一式。

## VPS: KAGOYA CLOUD VPS

**採用プラン**: 8GB プラン（6 vCPU / 8GB RAM / 800GB NVMe SSD、月額 ¥3,410〜）。
技術選定書 §9.1 が前提にしていた Hetzner CX33（4 vCPU / 8GB / 80GB、月額 $10〜15）と
CPU・RAM は同等以上、ストレージは大幅に上回るため、**FR-01b（Apple カタログ取り込み）を
有効化してもプラン変更が要らない**（想定 DB 容量は最大でも 55〜60GB、§7.3）。
OS は Ubuntu Server 24.04 LTS。

参考: [KAGOYA CLOUD VPS](https://www.kagoya.jp/vps/)、
[SSH接続の設定マニュアル](https://support.kagoya.jp/vps/manual/index.php?action=artikel&cat=25&id=9&artlang=ja)

### KAGOYA 固有の初期セットアップの違い

他社 VPS（root で直接 SSH できるタイプ）と違い、KAGOYA は次の流れになる。

1. コントロールパネルで **ログイン用認証キー**（公開鍵）を先に登録する
2. インスタンス作成時にそのキーを選択する
3. 作成後は **`ubuntu` ユーザー**（sudo 可）でログインする。root ログイン・パスワード認証は
   最初から無効になっている

`bootstrap.sh` はこの前提（`ubuntu` から `sudo` 経由で実行する）に合わせて自己昇格するので、
そのまま使える。

```bash
scp infra/bootstrap.sh ubuntu@<VPSのIP>:~/
ssh ubuntu@<VPSのIP> 'bash bootstrap.sh'
```

`ubuntu` ユーザーが最初から持っている公開鍵は、そのまま `deploy` ユーザーへ引き継がれる
（`DEPLOY_SSH_PUBKEY` を明示しなければ自動でそうなる）。

## セットアップの順番

1. `bootstrap.sh` を実行（OS 更新・`deploy` ユーザー・ファイアウォール・Docker・cron）
2. `deploy` ユーザーで再ログインし、`infra/.env` を `.env.example` から作ってシークレットを埋める
3. `docker compose build && docker compose up -d` —— **初回はリポジトリから直接ビルドする**ので
   GitHub Actions・GHCR の設定は不要
4. `curl -f https://$DIGGR_DOMAIN/health` で疎通確認
5. `backup.sh` の日次 cron が動いていることを翌日以降に確認、`RECOVERY.md` の復旧訓練を 1 回実施

### CI/CD（`.github/workflows/deploy.yml`）へ切り替えるとき

上のステップ3はコードを直すたびに手動で VPS に入って `git pull && docker compose build` する
ことになる。それを自動化するのが `deploy.yml` だが、有効にする前に 2 点対応が要る。

1. GitHub Secrets に `VPS_HOST` / `VPS_USER`（`deploy`） / `VPS_SSH_KEY` を登録する
2. **GHCR に push したイメージは既定で非公開**なので、VPS 側で一度だけ
   `echo <個人アクセストークン> | docker login ghcr.io -u <GitHubユーザー名> --password-stdin`
   を実行するか、GitHub の Package 設定でそのイメージを Public にする

どちらもやらない場合は手順3を手動で繰り返す運用のままでよい（小規模なうちは実害はない）。

## ファイル一覧

| ファイル | 役割 |
| --- | --- |
| `bootstrap.sh` | VPS の初期セットアップ（冪等） |
| `docker-compose.yml` | caddy / api / postgres / redis / pipeline |
| `Caddyfile` / `Dockerfile.caddy` | TLS 終端・レート制限（xcaddy でビルド） |
| `.env.example` | 本番の `.env` の雛形 |
| `backup.sh` / `restore.sh` / `RECOVERY.md` | 日次バックアップと復旧手順 |
