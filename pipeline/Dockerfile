# 月次バッチ用イメージ（infra/docker-compose.yml の `pipeline` サービス）。
# 常駐しない。cron から `docker compose --profile pipeline run --rm pipeline` で都度起動する。
FROM node:20-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY pipeline/package.json pipeline/package.json
RUN npm ci --workspace @diggr/core --workspace @diggr/pipeline
COPY packages/core packages/core
COPY pipeline pipeline

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/pipeline
# TODO(本番パイプライン実装時): エントリポイントを月次実行スクリプトに差し替える
# （README.md の「まだ無いもの」参照）。現状は疎通確認 CLI のみ。
CMD ["npx", "tsx", "src/cli/fetch-sample.ts"]
