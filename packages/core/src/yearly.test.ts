import { describe, expect, it } from 'vitest';
import {
  adminOnlyRefusal,
  canAdminister,
  canEditLineups,
  canManagePenalties,
  canViewStats,
  OFFICER_SECTIONS,
  officerSections,
  roleLabels,
  ROLES,
  type Role,
} from './member.ts';
import { validateRegistration } from './registration.ts';
import { aMember, MONDAY } from './testing.ts';
import {
  parseStudentNos,
  planGenerationChange,
  planGradePromotion,
  type RosterMember,
} from './yearly.ts';

const roster = (
  id: string,
  grade: RosterMember['grade'],
  overrides: Partial<RosterMember> = {},
): RosterMember => ({
  ...aMember({ id }),
  studentNo: id.toUpperCase(),
  grade,
  role: 'member',
  isAdmin: false,
  ...overrides,
});

const members = [
  roster('cap', 'B3', { role: 'captain' }),
  roster('vice', 'B3', { role: 'vice' }),
  roster('next', 'B2'),
  roster('sub', 'B2'),
  roster('old', 'B4', { status: 'retired', retiredOn: '2025-10-01' }),
];

const change = (captainNos: string[], viceNos: string[] = []) =>
  planGenerationChange({ members, retiringGrade: 'B3', captainNos, viceNos, today: MONDAY });

describe('代替わり', () => {
  it('学年の現役を引退にして、役職を入れ替える', () => {
    const result = change(['NEXT'], ['SUB']);

    expect(result).toMatchObject({ ok: true, value: { retiringIds: ['cap', 'vice'] } });
    expect(result.ok && result.value.updated).toMatchObject([
      { id: 'cap', status: 'retired', retiredOn: MONDAY, role: 'member' },
      { id: 'vice', status: 'retired', role: 'member' },
      { id: 'next', role: 'captain' },
      { id: 'sub', role: 'vice' },
    ]);
  });

  it('主将がいなくなる指定は拒否する', () => {
    expect(change([])).toMatchObject({ ok: false });
  });

  it('名簿にない学生番号は拒否する', () => {
    expect(change(['NOBODY'])).toEqual({
      ok: false,
      message: '名簿にない学生番号があります：NOBODY',
    });
  });

  it('現役がいない学年は拒否する', () => {
    expect(
      planGenerationChange({
        members,
        retiringGrade: 'M1',
        captainNos: [],
        viceNos: [],
        today: MONDAY,
      }),
    ).toMatchObject({ ok: false });
  });

  it('学生番号は区切り文字と大文字小文字を問わない', () => {
    expect(parseStudentNos(' s1234、s5678, S9 ')).toEqual(['S1234', 'S5678', 'S9']);
  });
});

describe('ほかの役職がある場合の代替わり', () => {
  it('引退する人の役職は外し、残る人の役職は変えない', () => {
    const result = planGenerationChange({
      members: [
        ...members,
        roster('money', 'B3', { role: 'treasurer' }),
        roster('chief', 'B2', { role: 'chief_manager' }),
      ],
      retiringGrade: 'B3',
      captainNos: ['NEXT'],
      viceNos: [],
      today: MONDAY,
    });

    expect(result.ok && result.value.updated).toContainEqual(
      expect.objectContaining({ id: 'money', status: 'retired', role: 'member' }),
    );
    expect(result.ok && result.value.updated.map((member) => member.id)).not.toContain('chief');
  });
});

describe('管理者がいる場合の代替わり', () => {
  const run = (captainNos: string[], role: Role = 'member') =>
    planGenerationChange({
      members: [...members, roster('dev', 'B3', { role, isAdmin: true })],
      retiringGrade: 'B3',
      captainNos,
      viceNos: [],
      today: MONDAY,
    });

  it('引退すると役職は外れて管理者の指定は残り、主将の指定がなくても実行できる', () => {
    const result = run([], 'treasurer');

    expect(result.ok && result.value.updated).toContainEqual(
      expect.objectContaining({ id: 'dev', status: 'retired', role: 'member', isAdmin: true }),
    );
  });

  it('管理者の人も、新しい主将に指定できる', () => {
    const result = run(['DEV']);

    expect(result.ok && result.value.updated).toContainEqual(
      expect.objectContaining({ id: 'dev', role: 'captain', isAdmin: true }),
    );
  });
});

describe('学年の繰り上げ（受け入れテスト26）', () => {
  const promote = (today: string, lastFiscalYear: number | null) =>
    planGradePromotion({
      members: [
        roster('cap', 'B2', { role: 'captain' }),
        roster('senior', 'B4'),
        roster('master', 'M2', { status: 'retired' }),
        roster('rest', 'B1', { status: 'suspended' }),
        roster('grad', 'B4', { status: 'graduated' }),
      ],
      today,
      lastFiscalYear,
    });

  it('学年を上げ、4年と院2年は卒業にする', () => {
    const result = promote('2027-04-01', null);

    expect(result.ok && result.value).toMatchObject({
      fiscalYear: 2027,
      graduatingIds: ['senior', 'master'],
      updated: [
        { id: 'cap', grade: 'B3', status: 'active' },
        { id: 'senior', grade: 'B4', status: 'graduated' },
        { id: 'master', grade: 'M2', status: 'graduated' },
      ],
    });
  });

  it('26: 同じ年度の2回目は拒否する', () => {
    expect(promote('2028-03-31', 2027)).toMatchObject({ ok: false });
    expect(promote('2028-04-01', 2027)).toMatchObject({ ok: true });
  });

  it('主将が卒業して誰もいなくなる場合は拒否する', () => {
    const result = planGradePromotion({
      members: [roster('cap', 'B4', { role: 'captain' })],
      today: '2027-04-01',
      lastFiscalYear: null,
    });

    expect(result).toMatchObject({ ok: false });
  });
});

const as = (role: Role, options: { isAdmin?: boolean; approved?: boolean } = {}) => ({
  ...aMember({ approved: options.approved ?? true }),
  role,
  isAdmin: options.isAdmin ?? false,
});

describe('権限', () => {
  it('管理者は、役職が何でも主将の操作と罰の操作ができる', () => {
    for (const role of ROLES) {
      const admin = as(role, { isAdmin: true });
      expect([canAdminister(admin), canManagePenalties(admin)]).toEqual([true, true]);
    }
    expect(canAdminister(as('member', { isAdmin: true, approved: false }))).toBe(false);
  });

  it('管理者の付け外しと、管理者の変更は管理者だけ', () => {
    const refusal = (actorIsAdmin: boolean, targetIsAdmin: boolean, nextIsAdmin?: boolean) =>
      adminOnlyRefusal({ actorIsAdmin, targetIsAdmin, nextIsAdmin });

    expect(refusal(false, true)).not.toBeNull();
    expect(refusal(false, false, true)).not.toBeNull();
    expect(refusal(false, false, false)).toBeNull();
    expect(refusal(false, false)).toBeNull();
    expect(refusal(true, true, false)).toBeNull();
  });

  it('部員の役職のうち、管理は主将、罰の操作は副務', () => {
    expect([canAdminister(as('captain')), canAdminister(as('vice'))]).toEqual([true, false]);
    expect([canManagePenalties(as('vice')), canManagePenalties(as('captain'))]).toEqual([
      true,
      false,
    ]);
    expect(canManagePenalties(as('member'))).toBe(false);
    expect(canAdminister(as('captain', { approved: false }))).toBe(false);
  });

  it('画面の役職の名前は、管理者を後ろに足す', () => {
    expect(roleLabels(as('captain', { isAdmin: true }))).toEqual(['主将', '管理者']);
    expect(roleLabels(as('member', { isAdmin: true }))).toEqual(['管理者']);
    expect(roleLabels(as('member'))).toEqual([]);
  });
});

describe('部員登録の入力', () => {
  const input = { studentNo: ' s 1234 ', name: ' 山田　 太郎 ', gender: 'male', grade: 'B1' };

  it('学生番号と名前を整える', () => {
    expect(validateRegistration(input)).toMatchObject({
      ok: true,
      value: { studentNo: 'S1234', name: '山田 太郎' },
    });
  });

  it.each([
    { studentNo: 'ab' },
    { name: ' ' },
    { name: 'あ'.repeat(31) },
    { gender: '' },
    { grade: 'B5' },
  ])('%o は拒否する', (change) => {
    expect(validateRegistration({ ...input, ...change }).ok).toBe(false);
  });
});

describe('役職と権限', () => {
  it('会計の権限は部員と同じ', () => {
    const treasurer = as('treasurer');

    expect([canAdminister(treasurer), canManagePenalties(treasurer)]).toEqual([false, false]);
    expect(officerSections(treasurer)).toEqual([]);
  });

  it('立ち順と予定を扱えるのは4役と管理者', () => {
    expect(canEditLineups(as('chief_manager'))).toBe(true);
    expect(canEditLineups(as('vice'))).toBe(false);
    expect(canEditLineups(as('vice', { isAdmin: true }))).toBe(true);
  });

  it('集計を見られるのは主将・副務・男女の副将・管理者', () => {
    const viewers = ROLES.filter((role) => canViewStats(as(role)));

    expect(viewers).toEqual(['captain', 'men_vice_captain', 'women_vice_captain', 'vice']);
    expect(canViewStats(as('chief_manager', { isAdmin: true }))).toBe(true);
  });
});

describe('役職の画面の項目', () => {
  it('管理者はすべてで、主将は罰の管理を除くすべて', () => {
    const admin = officerSections(as('member', { isAdmin: true }));

    expect(admin).toEqual([...OFFICER_SECTIONS]);
    expect(officerSections(as('captain'))).toEqual(
      admin.filter((section) => section !== 'penalties'),
    );
  });

  it('役職ごとに出すものが違う', () => {
    expect(officerSections(as('men_vice_captain'))).toEqual([
      'lineup',
      'clubSchedule',
      'memberSchedule',
      'stats',
      'export',
    ]);
    expect(officerSections(as('chief_manager'))).toEqual([
      'lineup',
      'clubSchedule',
      'memberSchedule',
    ]);
    expect(officerSections(as('vice'))).toEqual(['notices', 'penalties', 'stats', 'export']);
    expect(officerSections(as('member'))).toEqual([]);
    expect(officerSections(as('captain', { approved: false }))).toEqual([]);
  });
});
