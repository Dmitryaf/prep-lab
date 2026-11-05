import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: './.vitest-cache',
  esbuild: { jsx: 'automatic' },
  test: { cache: false },
});
