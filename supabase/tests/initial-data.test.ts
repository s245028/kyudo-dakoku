// DB の初期値が packages/core の定義と食い違っていないかを確かめる
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_PENALTY_TYPES, DEFAULT_SETTINGS } from '../../packages/core/src/index.ts';
import { RULES } from '../../packages/core/src/testing.ts';
import { connect } from './helpers.ts';

const sql = connect();
afterAll(() => sql.end());

describe('初期値', () => {
  it('設定は core の既定値と同じ（入口QRはローカル用の仮の値）', async () => {
    const rows = await sql<{ key: string; value: unknown }[]>`select * from public.settings`;

    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toEqual({
      ...DEFAULT_SETTINGS,
      entranceQr: 'LOCAL-TEST-QR',
    });
  });

  it('練習ルール', async () => {
    const rows = await sql`select weekday, condition, part,
      to_char(deadline, 'HH24:MI') as deadline, to_char(start_time, 'HH24:MI') as "startTime"
      from public.practice_rules`;

    expect(rows).toHaveLength(RULES.length);
    expect(rows).toEqual(expect.arrayContaining(RULES));
  });

  it('罰の種類', async () => {
    const rows = await sql`select reason, base_count as "baseCount",
      assigned_by as "assignedBy", description from public.penalty_types`;

    expect(rows).toHaveLength(DEFAULT_PENALTY_TYPES.length);
    expect(rows).toEqual(expect.arrayContaining([...DEFAULT_PENALTY_TYPES]));
  });
});
