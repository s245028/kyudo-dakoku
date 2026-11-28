import { describe, expect, it } from 'vitest';
import {
  arrangeLineup,
  canInsertBeside,
  describePosition,
  dropInLineup,
  groupPositionName,
  groupSizeOf,
  isLineupStale,
  lineupColumnName,
  lineupWarnings,
  moveInLineup,
  SEPARATED_ROLES,
  swapInLineup,
  validateLineup,
  type LineupGroups,
} from './lineup.ts';
import type { Grade, Role } from './member.ts';
import {
  isAway,
  listParticipants,
  practiceParts,
  type Participant,
  type Person,
} from './participants.ts';
import { toInstant } from './date.ts';
import {
  aMember,
  anException,
  aPunch,
  MONDAY,
  NO_KOMA,
  RULES,
  SATURDAY,
  WEDNESDAY,
} from './testing.ts';

const person = (id: string, grade: Grade = 'B2', role: Role = 'member'): Person => ({
  ...aMember({ id }),
  studentNo: id,
  name: id,
  grade,
  gender: 'male',
  role,
});

const entry = (
  id: string,
  overrides: Partial<{ grade: Grade; role: Role; status: Participant['status'] }> = {},
): Participant => ({
  person: person(id, overrides.grade, overrides.role),
  part: 'first',
  status: overrides.status ?? 'expected',
  pending: false,
  inRoom: false,
  startsAt: toInstant(MONDAY, '17:30'),
});

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => entry(`m${String(index).padStart(2, '0')}`));

const OFFICERS: Role[] = ['captain', 'men_vice_captain', 'women_vice_captain', 'chief_manager'];
const leaders = [
  ...OFFICERS.map((role) => entry(role, { role, grade: 'B3' })),
  ...['v1', 'v2', 'v3'].map((id) => entry(id, { role: 'vice', grade: 'B3' })),
];

const separated = (groups: LineupGroups, people: Participant[]) =>
  SEPARATED_ROLES.every((roles) =>
    groups.every(
      (group) =>
        group.filter((id) => {
          const found = people.find((candidate) => candidate.person.id === id);
          return found && roles.includes(found.person.role);
        }).length <= 1,
    ),
  );

describe('参加者', () => {
  const list = (exceptions: Parameters<typeof listParticipants>[0]['exceptions'] = []) =>
    listParticipants({
      date: MONDAY,
      members: [
        person('m1'),
        person('m2'),
        person('m3'),
        { ...person('old'), status: 'retired' },
        { ...person('rest'), status: 'suspended' },
      ],
      rules: RULES,
      komaByMember: new Map([['m3', { ...NO_KOMA, mon5: true }]]),
      exceptions,
      punches: [aPunch(MONDAY, '16:50:00')],
    });

  it('現役は連絡がなければ参加。引退した人は参加を登録した人だけ', () => {
    expect(list().map((found) => [found.person.id, found.status, found.part])).toEqual([
      ['m1', 'expected', 'first'],
      ['m2', 'expected', 'first'],
      ['m3', 'expected', 'second'],
    ]);
    expect(list([anException(MONDAY, 'join', { memberId: 'old' })])).toHaveLength(4);
  });

  it('欠席と遅刻の連絡、承認待ち、在室を返す。却下した連絡は使わない', () => {
    const found = list([
      anException(MONDAY, 'absent_notice', { memberId: 'm2', approval: 'pending' }),
      anException(MONDAY, 'late_notice', { memberId: 'm3', approval: 'rejected' }),
    ]);

    expect(found).toMatchObject([
      { status: 'expected', inRoom: true, pending: false },
      { status: 'absent', inRoom: false, pending: true },
      { status: 'expected', pending: false },
    ]);
  });
});

describe('道場にいない人', () => {
  const start = toInstant(MONDAY, '17:30');

  it('練習が始まったあと、道場にいない参加者を指す', () => {
    expect(isAway(entry('m1'), new Date(start.getTime() - 1))).toBe(false);
    expect(isAway(entry('m1'), start)).toBe(true);
    expect(isAway({ ...entry('m1'), inRoom: true }, start)).toBe(false);
    expect(isAway(entry('m1', { status: 'absent' }), start)).toBe(false);
  });

  it('練習の終了後に入室した人は欠席にする', () => {
    const [found] = listParticipants({
      date: MONDAY,
      members: [person('m1')],
      rules: RULES.map((rule) => ({ ...rule, endTime: '19:00' })),
      komaByMember: new Map(),
      exceptions: [],
      punches: [aPunch(MONDAY, '19:30:00')],
    });

    expect(found).toMatchObject({ status: 'absent', startsAt: start });
  });
});

describe('的割りで並べる', () => {
  it('9的に均等に配り、学年の上の人を前にする', () => {
    const people = [...many(18), entry('senior', { grade: 'B4' })];
    const groups = arrangeLineup('targets', people);

    expect(groups).toHaveLength(9);
    expect(groups.map((group) => group.length).sort()).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 3]);
    expect(groups[0]![0]).toBe('senior');
  });

  it('遅刻者は列の後ろにし、欠席者は入れない', () => {
    const people = [
      entry('late', { grade: 'M2', status: 'late' }),
      entry('absent', { status: 'absent' }),
      ...many(9),
    ];
    const groups = arrangeLineup('targets', people);

    expect(groups.flat()).not.toContain('absent');
    expect(groups.find((group) => group.includes('late'))!.at(-1)).toBe('late');
  });

  it('幹部どうし、副務どうしは別の的にする', () => {
    const people = [...leaders, ...many(20)];
    const groups = arrangeLineup('targets', people);

    expect(separated(groups, people)).toBe(true);
    expect(groups.flat()).toHaveLength(27);
  });
});

describe('立ちに並べる', () => {
  it('1立ち8人までで、人数をそろえる', () => {
    const groups = arrangeLineup('groups', many(20));

    expect(groups.map((group) => group.length)).toEqual([7, 7, 6]);
  });

  it('分ける人が多ければ、立ちを増やして別にする', () => {
    const people = [...leaders, ...many(10)];
    const groups = arrangeLineup('groups', people);

    expect(groups).toHaveLength(4);
    expect(separated(groups, people)).toBe(true);
    expect(groups.every((group) => group.length <= 8)).toBe(true);
  });

  it('遅刻者は後の立ちにする', () => {
    const people = [entry('late', { grade: 'M2', status: 'late' }), ...many(15)];
    const groups = arrangeLineup('groups', people);

    expect(groups.at(-1)!.at(-1)).toBe('late');
  });

  it('ちょうど16人なら2立ち。参加者がいなければ空の1立ち', () => {
    expect(arrangeLineup('groups', many(16)).map((group) => group.length)).toEqual([8, 8]);
    expect(arrangeLineup('groups', [])).toEqual([[]]);
  });
});

describe('手で直す', () => {
  const groups = [['a', 'b'], ['c']];

  it('入れ替える。列にいない人は場所を引き継ぐ', () => {
    expect(swapInLineup(groups, 'a', 'c')).toEqual([['c', 'b'], ['a']]);
    expect(swapInLineup(groups, 'x', 'b')).toEqual([['a', 'x'], ['c']]);
  });

  it('列の最後に移すか、外す', () => {
    expect(moveInLineup('targets', groups, 'a', 1)).toEqual([['b'], ['c', 'a']]);
    expect(moveInLineup('targets', groups, 'x', 1)).toEqual([
      ['a', 'b'],
      ['c', 'x'],
    ]);
    expect(moveInLineup('targets', groups, 'a', null)).toEqual([['b'], ['c']]);
  });

  it('8人の立ちには足せない', () => {
    const full = [['1', '2', '3', '4', '5', '6', '7', '8'], ['9']];

    expect(moveInLineup('groups', full, '9', 0)).toEqual(full);
  });

  it('分ける役職が同じ列にいれば注意を出す', () => {
    const roles: Record<string, Role> = { a: 'captain', b: 'chief_manager', c: 'vice' };

    expect(lineupWarnings('targets', [['a', 'b', 'c']], (id) => roles[id])).toEqual([
      '大前に主将と主務がいます',
    ]);
  });
});

describe('的の呼び方', () => {
  it('大前の次は2的で、最後は落前と落', () => {
    expect(Array.from({ length: 9 }, (_, index) => lineupColumnName('targets', index))).toEqual([
      '大前',
      '2的',
      '3的',
      '4的',
      '5的',
      '6的',
      '7的',
      '落前',
      '落',
    ]);
  });
});

describe('その日の区分', () => {
  it('平日は参加者がいなくても前半と後半、土曜は全体', () => {
    expect(practiceParts(MONDAY, RULES, [])).toEqual(['first', 'second']);
    expect(practiceParts(SATURDAY, RULES, [])).toEqual(['whole']);
  });

  it('練習日でない日と、全員が休みの日はなし', () => {
    expect(practiceParts(WEDNESDAY, RULES, [])).toEqual([]);
    expect(
      practiceParts(MONDAY, RULES, [anException(MONDAY, 'day_off', { memberId: null })]),
    ).toEqual([]);
  });
});

describe('保存する内容', () => {
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const check = (format: string, groups: unknown) =>
    validateLineup({ part: 'first', format, groups });

  it('的割りは9列、立ちは空の列を除いて8人まで', () => {
    expect(check('targets', [[id(1)]]).ok).toBe(false);
    expect(check('groups', [[id(1)], []])).toMatchObject({ value: { groups: [[id(1)]] } });
    expect(check('groups', [Array.from({ length: 9 }, (_, n) => id(n))]).ok).toBe(true);
    expect(check('groups', [Array.from({ length: 10 }, (_, n) => id(n))]).ok).toBe(false);
  });

  it('同じ人の重複、空、形の違うものは拒否する', () => {
    expect(check('groups', [[id(1)], [id(1)]]).ok).toBe(false);
    expect(check('groups', [[]]).ok).toBe(false);
    expect(check('groups', [['x']]).ok).toBe(false);
    expect(check('groups', 'x').ok).toBe(false);
  });
});

describe('ほかの人の保存', () => {
  const time = '2026-11-30T03:00:00.000Z';

  it('編集のもとにした内容が最新なら、保存できる', () => {
    expect(isLineupStale(null, null)).toBe(false);
    expect(isLineupStale('2026-11-30T03:00:00+00:00', time)).toBe(false);
  });

  it('あとから保存や削除があれば、古い', () => {
    expect(isLineupStale(null, time)).toBe(true);
    expect(isLineupStale(time, null)).toBe(true);
    expect(isLineupStale(time, '2026-11-30T03:00:01.000Z')).toBe(true);
  });
});

describe('札を落とす', () => {
  const groups = [['a', 'b'], ['c']];
  const drop = (id: string, target: Parameters<typeof dropInLineup>[3]) =>
    dropInLineup('targets', groups, id, target);

  it('札の上に落とすと入れ替わる', () => {
    expect(drop('a', { type: 'tag', memberId: 'c' })).toEqual([['c', 'b'], ['a']]);
    expect(drop('x', { type: 'tag', memberId: 'b' })).toEqual([['a', 'x'], ['c']]);
  });

  it('列に落とすと最後に移り、置き場に落とすと外れる', () => {
    expect(drop('a', { type: 'column', index: 1 })).toEqual([['b'], ['c', 'a']]);
    expect(drop('a', { type: 'bench' })).toEqual([['b'], ['c']]);
  });

  it('変わらないときは、同じ並びを返す', () => {
    expect(drop('a', { type: 'tag', memberId: 'a' })).toBe(groups);
    expect(drop('x', { type: 'bench' })).toBe(groups);
    expect(drop('x', { type: 'tag', memberId: 'y' })).toBe(groups);
  });
});

describe('立ちの位置の名前と、自分の場所', () => {
  const names = (size: number) =>
    Array.from({ length: size }, (_, index) => groupPositionName(index, size));

  it('何人でも、先頭が大前で最後の2人が落前と落', () => {
    expect(names(8)).toEqual(['大前', '2的', '3的', '4的', '5的', '6的', '落前', '落']);
    expect(names(6)).toEqual(['大前', '2的', '3的', '4的', '落前', '落']);
    expect(names(3)).toEqual(['大前', '落前', '落']);
    expect(names(2)).toEqual(['大前', '落']);
    expect(names(1)).toEqual(['大前']);
  });

  it('的割りは的の名前だけ、立ちは何立ち目の何番目か', () => {
    const groups = [['a'], ['b', 'c']];

    expect(describePosition('targets', groups, 'a')).toBe('大前');
    expect(describePosition('targets', groups, 'c')).toBe('2的');
    expect(describePosition('groups', groups, 'c')).toBe('2立ち目の2番目');
    expect(describePosition('groups', groups, 'x')).toBeNull();
  });
});

describe('札の間に落とす', () => {
  const groups = [['a', 'b', 'c'], ['d']];
  const insert = (id: string, beside: string, side: 'before' | 'after') =>
    dropInLineup('targets', groups, id, { type: 'tag', memberId: beside, side });

  it('間に入れて、後ろをずらす', () => {
    expect(insert('c', 'a', 'before')).toEqual([['c', 'a', 'b'], ['d']]);
    expect(insert('a', 'b', 'after')).toEqual([['b', 'a', 'c'], ['d']]);
    expect(insert('d', 'b', 'before')).toEqual([['a', 'd', 'b', 'c'], []]);
    expect(insert('x', 'c', 'after')).toEqual([['a', 'b', 'c', 'x'], ['d']]);
  });

  it('並びが変わらない場所なら、同じ並びを返す', () => {
    expect(insert('a', 'b', 'before')).toBe(groups);
    expect(insert('c', 'b', 'after')).toBe(groups);
    expect(insert('a', 'a', 'after')).toBe(groups);
  });

  it('8人の立ちにほかから入れるときと、置き場の札の前後は、入れ替える', () => {
    const full = [['1', '2', '3', '4', '5', '6', '7', '8'], ['9']];
    const target = { type: 'tag', memberId: '1', side: 'before' } as const;

    expect(canInsertBeside('groups', full, '9', '1')).toBe(false);
    expect(dropInLineup('groups', full, '9', target)).toEqual([
      ['9', '2', '3', '4', '5', '6', '7', '8'],
      ['1'],
    ]);
    expect(canInsertBeside('groups', full, '8', '1')).toBe(true);
    expect(insert('a', 'x', 'before')).toEqual([['x', 'b', 'c'], ['d']]);
  });
});

describe('9的の立ち', () => {
  const sizes = (count: number, groupSize: 8 | 9) =>
    arrangeLineup('groups', many(count), groupSize).map((group) => group.length);

  it('9人までを選ぶと、少ない立ち数で並べる', () => {
    expect(sizes(17, 8)).toEqual([6, 6, 5]);
    expect(sizes(17, 9)).toEqual([9, 8]);
    expect(sizes(18, 9)).toEqual([9, 9]);
    expect(sizes(19, 9)).toEqual([7, 6, 6]);
  });

  it('9人の呼び方は、大前・2的〜7的・落前・落', () => {
    expect(Array.from({ length: 9 }, (_, index) => groupPositionName(index, 9))).toEqual([
      '大前',
      '2的',
      '3的',
      '4的',
      '5的',
      '6的',
      '7的',
      '落前',
      '落',
    ]);
  });

  it('手で9人目を足せるのは、9人までを選んだとき', () => {
    const full = [['1', '2', '3', '4', '5', '6', '7', '8'], ['9']];
    const column = { type: 'column', index: 0 } as const;
    const before = { type: 'tag', memberId: '1', side: 'before' } as const;

    expect(dropInLineup('groups', full, '9', column)).toEqual(full);
    expect(dropInLineup('groups', full, '9', column, 9)[0]).toHaveLength(9);
    expect(dropInLineup('groups', full, '9', before, 9)[0]![0]).toBe('9');
    expect(groupSizeOf(full)).toBe(8);
    expect(groupSizeOf(dropInLineup('groups', full, '9', column, 9))).toBe(9);
  });
});
