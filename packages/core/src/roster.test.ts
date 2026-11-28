import { describe, expect, it } from 'vitest';
import { groupRoster, matchesMember } from './roster.ts';

const member = (
  studentNo: string,
  grade: 'B1' | 'B3' | 'M1',
  status: 'active' | 'retired' | 'suspended' | 'graduated' = 'active',
) => ({ studentNo, grade, status });

describe('名簿の分け方', () => {
  it('現役・引退・休部と卒業に分け、学年が上の人から学生番号の順に並べる', () => {
    const groups = groupRoster([
      member('S3', 'B1'),
      member('S2', 'B3'),
      member('S5', 'M1'),
      member('S1', 'B3'),
      member('S4', 'B3', 'retired'),
      member('S7', 'B1', 'graduated'),
      member('S6', 'B3', 'suspended'),
    ]);

    expect(groups.active.map((entry) => entry.studentNo)).toEqual(['S5', 'S1', 'S2', 'S3']);
    expect(groups.retired.map((entry) => entry.studentNo)).toEqual(['S4']);
    expect(groups.other.map((entry) => entry.studentNo)).toEqual(['S6', 'S7']);
  });
});

describe('名簿の検索', () => {
  const taro = { name: '山田 太郎', studentNo: 'S1234' };

  it.each(['', '山田', '田太', ' 山田　太郎 ', 's12', 'ｓ１２３４'])('%o は見つかる', (query) => {
    expect(matchesMember(taro, query)).toBe(true);
  });

  it.each(['佐藤', 'S9'])('%o は見つからない', (query) => {
    expect(matchesMember(taro, query)).toBe(false);
  });
});
