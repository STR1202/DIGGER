import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// root を明示しないと、workspace 配下（例: packages/core）から
// `vitest run` を叩いたときに cwd 基準で include が解決され、0 件になる。
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['packages/*/src/**/*.test.ts', 'pipeline/src/**/*.test.ts'],
    environment: 'node',
  },
});
