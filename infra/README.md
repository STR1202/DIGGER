# infra/

本番環境（Plan B: VPS 1 台、技術選定書 §9.1）の構成一式。

## VPS: Xserver VPS

**採用プラン**: 8GB プラン（6 vCPU / 8GB RAM / 400GB SSD、月額 ¥3,850〜）。
技術選定書 §9.1 が前提にしていた Hetzner CX33（4 vCPU / 8GB / 80GB、月額 $10〜15）と
CPU・RAM は同等以上、ストレージは大幅に上回るため、**FR-01b（Apple カタログ取り込み）を
有効化してもプラン変更が要らない**（想定 DB 容量は最大でも 55〜60GB、§7.3）。
OS は Ubuntu Server 24.04 LTS。

参考: [Xserver VPS](https://vps.xserver.ne.jp/)、
[SSH接続方法マニュアル](https://vps.xserver.ne.jp/support/manual/man_server_ssh_connect.php)

### Xserver 固有の初期セットアップの違い

KAGOYA 等の「非rootユーザー + sudo」方式と違い、Xserver は契約・インスタンス作成の画面で
SSH キーを登録すると、**そのまま root で直接 SSH ログインできる**。

1. 契約時（またはOS再インストール時）の画面で SSH キーを新規生成 or 登録する
2. 作成後は **`root`** で直接ログインする（パスワードでもログインできるが、鍵認証を推奨）

```bash
scp infra/bootstrap.sh root@<VPSのIP>:~/
ssh root@<VPSのIP> 'bash bootstrap.sh'
```

`bootstrap.sh` は root 自身の公開鍵をそのまま `deploy` ユーザーへ引き継ぎ、
**`deploy` に鍵を設定できたことを確認してから** root ログイン・パスワード認証を無効化する
（鍵が見つからない場合は閉め出しを避けるためスクリプトの方が止まる）。

> KAGOYA 等「ubuntu ユーザー + sudo」方式の VPS に戻す場合も、同じ `bootstrap.sh` が
> sudo 経由の実行を自動検知してそのまま使える（`ssh ubuntu@<IP> 'bash bootstrap.sh'`）。

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
