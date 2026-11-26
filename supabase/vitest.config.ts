// ローカルの Supabase を使うテスト。`pnpm test:db` で実行する。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/local-stack.ts'],
    // 同じ DB を使うので、ファイルは順番に実行する
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
