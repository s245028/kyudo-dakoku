// テスト用のデータ。アプリからは使わない
import type { Member } from './member.ts';
import type { Koma, PracticeException, PracticeRule } from './practice.ts';
import type { Punch, PunchKind } from './punch.ts';
import { toInstant, type PracticeDate } from './date.ts';

export const MONDAY = '2026-11-30';
export const TUESDAY = '2026-12-01';
export const WEDNESDAY = '2026-12-02';
export const SATURDAY = '2026-12-05';

const weekdayRules = (weekday: number): PracticeRule[] => [
  {
    weekday,
    condition: 'no_koma',
    part: 'first',
    deadline: '17:00',
    startTime: '17:30',
    endTime: null,
  },
  {
    weekday,
    condition: 'koma4',
    part: 'first',
    deadline: '17:30',
    startTime: '17:30',
    endTime: null,
  },
  {
    weekday,
    condition: 'koma5',
    part: 'second',
    deadline: '19:15',
    startTime: '19:45',
    endTime: null,
  },
];

export const RULES: PracticeRule[] = [
  ...[1, 2, 4].flatMap(weekdayRules),
  {
    weekday: 6,
    condition: 'all',
    part: 'whole',
    deadline: '08:20',
    startTime: '09:15',
    endTime: null,
  },
];

export const NO_KOMA: Koma = {
  mon4: false,
  mon5: false,
  tue4: false,
  tue5: false,
  thu4: false,
  thu5: false,
};

export function aMember(overrides: Partial<Member> = {}): Member {
  return { id: 'm1', status: 'active', approved: true, retiredOn: null, ...overrides };
}

/** `time` は日本時間の `HH:mm:ss` */
export function aPunch(
  date: PracticeDate,
  time: string,
  kind: PunchKind = 'in',
  overrides: Partial<Punch> = {},
): Punch {
  const at = new Date(toInstant(date, time.slice(0, 5)).getTime() + Number(time.slice(6)) * 1000);
  return { memberId: 'm1', at, kind, canceledAt: null, ...overrides };
}

export function anException(
  date: PracticeDate,
  kind: PracticeException['kind'],
  overrides: Partial<PracticeException> = {},
): PracticeException {
  return { date, kind, memberId: 'm1', memo: '', contactedAt: null, ...overrides };
}
