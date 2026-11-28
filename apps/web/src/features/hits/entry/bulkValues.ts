// まとめて入れる欄の内容。送れなかったときのために、端末に残す
import { HIT_CATEGORIES, type HitCategory } from '@kyudo/core';
import type { StoredHitRecord } from '../../../lib/hitQueries.ts';

export type BulkValue = {
  shots: string;
  hits: string;
  /** 一射ずつの記録を、合計に置き換えるか */
  replace: boolean;
  /** 欄を開いたときの記録の番号 */
  base: number | null;
};
export type BulkValues = Record<HitCategory, BulkValue>;

/** 今の記録を入れた欄 */
export function valuesOf(records: readonly StoredHitRecord[]): BulkValues {
  return Object.fromEntries(
    HIT_CATEGORIES.map((category) => {
      const record = records.find((candidate) => candidate.category === category);
      const total = record?.mode === 'total' ? record : undefined;
      return [
        category,
        {
          shots: total ? String(total.shots) : '',
          hits: total ? String(total.hits) : '',
          replace: false,
          base: record?.revision ?? null,
        },
      ];
    }),
  ) as BulkValues;
}

const keyOf = (memberId: string, date: string) => `hit-bulk:${memberId}:${date}`;

export function readBulk(memberId: string, date: string): BulkValues | null {
  try {
    const stored = localStorage.getItem(keyOf(memberId, date));
    return stored ? (JSON.parse(stored) as BulkValues) : null;
  } catch {
    return null;
  }
}

export function storeBulk(memberId: string, date: string, values: BulkValues | null) {
  try {
    if (values) localStorage.setItem(keyOf(memberId, date), JSON.stringify(values));
    else localStorage.removeItem(keyOf(memberId, date));
  } catch {
    // 残せなくても、入力は続けられる
  }
}
