# API サーバー（技術選定書 §9.1）。esbuild でバンドルし、実行時は素の Node だけで動く。
FROM node:20-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci --workspace @diggr/core --workspace @diggr/api
COPY packages/core packages/core
COPY services/api services/api
RUN npm run build --workspace @diggr/api

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/services/api/dist/server.mjs ./server.mjs
# esbuild は @diggr/core をバンドルに含めるが、pg 等のネイティブ依存は external のまま。
COPY --from=build /repo/services/api/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "server.mjs"]
