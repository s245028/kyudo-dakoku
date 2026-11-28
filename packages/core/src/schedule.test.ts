import { describe, expect, it } from 'vitest';
import { groupSchedule, scheduleLabel, validateSchedule, type ScheduleEntry } from './schedule.ts';

const today = '2026-11-28';
const validate = (input: Record<string, unknown>, allowPast = false) =>
  validateSchedule({ from: today, kind: 'day_off', ...input }, { today, allowPast });

describe('予定の入力', () => {
  it('終了日が空なら1日だけで、部員を選ばなければ部全体', () => {
    expect(validate({ to: '', memo: ' 点検 ' })).toEqual({
      ok: true,
      value: { memberId: null, kind: 'day_off', memo: '点検', dates: [today] },
    });
  });

  it('期間は両端の日を含み、月と年をまたげる', () => {
    const result = validate({ from: '2026-12-30', to: '2027-01-02', memberId: 'm1' });

    expect(result.ok && result.value.dates).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(result.ok && result.value.memberId).toBe('m1');
  });

  it.each([
    { from: '' },
    { from: '2026-12-02', to: '2026-12-01' },
    { to: '2027-03-01' },
    { kind: 'late_notice' },
    { kind: 'join' },
  ])('%o は拒否する', (change) => {
    expect(validate(change).ok).toBe(false);
  });

  it('92日までは指定できる', () => {
    expect(validate({ to: '2027-02-27' }).ok).toBe(true);
    expect(validate({ to: '2027-02-28' }).ok).toBe(false);
  });

  it('過ぎた日を変えられるのは、主将と管理者だけ', () => {
    expect(validate({ from: '2026-11-27' })).toMatchObject({ ok: false });
    expect(validate({ from: '2026-11-27' }, true)).toMatchObject({ ok: true });
  });
});

describe('予定のまとめ方', () => {
  let sequence = 0;
  const entry = (date: string, overrides: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    id: `e${(sequence += 1)}`,
    date,
    memberId: null,
    kind: 'day_off',
    memo: '冬休み',
    ...overrides,
  });

  it('日が続く同じ内容を1つの期間にし、始まる日の順に並べる', () => {
    const ranges = groupSchedule([
      entry('2027-01-01'),
      entry('2026-12-31'),
      entry('2026-12-30', { kind: 'no_koma', memo: '休講' }),
      entry('2027-01-03'),
    ]);

    expect(ranges.map(({ from, to, kind, ids }) => [from, to, kind, ids.length])).toEqual([
      ['2026-12-30', '2026-12-30', 'no_koma', 1],
      ['2026-12-31', '2027-01-01', 'day_off', 2],
      ['2027-01-03', '2027-01-03', 'day_off', 1],
    ]);
  });

  it('人やメモが違えばまとめない', () => {
    const ranges = groupSchedule([
      entry('2026-12-01', { memberId: 'a' }),
      entry('2026-12-02', { memberId: 'b' }),
      entry('2026-12-03', { memberId: 'a', memo: '学会' }),
    ]);

    expect(ranges).toHaveLength(3);
  });

  it('一人だけの休みは公欠と呼ぶ', () => {
    expect([scheduleLabel('day_off', 'a'), scheduleLabel('day_off', null)]).toEqual([
      '公欠',
      '休み',
    ]);
    expect(scheduleLabel('koma4', 'a')).toBe('4コマあり');
  });
});
