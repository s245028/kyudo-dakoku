import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

export type LocalStack = { apiUrl: string; publishableKey: string; dbUrl: string };

declare module 'vitest' {
  export interface ProvidedContext {
    stack: LocalStack;
  }
}

/** 起動中のローカル Supabase の接続先を調べて、テストに渡す。 */
export default function setup(project: TestProject) {
  let output: string;
  try {
    output = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new Error('ローカルの Supabase を起動してください: pnpm exec supabase start', { cause });
  }
  const values = new Map(
    [...output.matchAll(/^([A-Z_]+)="?(.*?)"?$/gm)].map((match) => [match[1], match[2]]),
  );
  const read = (name: string) => {
    const value = values.get(name);
    if (!value) throw new Error(`supabase status に ${name} がありません`);
    return value;
  };
  const apiUrl = read('API_URL');
  // テストはデータを消すので、ローカル以外には絶対につながない
  const dbUrl = read('DB_URL');
  for (const url of [apiUrl, dbUrl]) {
    if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
      throw new Error('テストはローカルの Supabase にだけ接続します');
    }
  }
  project.provide('stack', {
    apiUrl,
    publishableKey: values.get('PUBLISHABLE_KEY') ?? read('ANON_KEY'),
    dbUrl,
  });
}
