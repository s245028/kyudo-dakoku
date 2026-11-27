import { describe, expect, it } from 'vitest';
import { adminOnlyRefusal, canAdminister, canManagePenalties } from './member.ts';
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

describe('管理者がいる場合の代替わり', () => {
  const run = (captainNos: string[]) =>
    planGenerationChange({
      members: [...members, roster('dev', 'B3', { role: 'admin' })],
      retiringGrade: 'B3',
      captainNos,
      viceNos: [],
      today: MONDAY,
    });

  it('管理者は引退しても役職が残り、主将の指定がなくても実行できる', () => {
    const result = run([]);

    expect(result.ok && result.value.updated).toContainEqual(
      expect.objectContaining({ id: 'dev', status: 'retired', role: 'admin' }),
    );
  });

  it('管理者を新しい主将に指定することはできない', () => {
    expect(run(['DEV'])).toMatchObject({ ok: false });
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

describe('権限', () => {
  const as = (role: RosterMember['role'], approved = true) => ({
    ...aMember({ approved }),
    role,
  });

  it('管理者は主将と同じ操作ができる', () => {
    expect([canAdminister(as('admin')), canManagePenalties(as('admin'))]).toEqual([true, true]);
    expect(canAdminister(as('admin', false))).toBe(false);
  });

  it('管理者の付け外しと、管理者の変更は管理者だけ', () => {
    const refusal = (
      actorIsAdmin: boolean,
      targetRole: RosterMember['role'],
      nextRole?: RosterMember['role'],
    ) => adminOnlyRefusal({ actorIsAdmin, targetRole, nextRole });

    expect(refusal(false, 'admin')).not.toBeNull();
    expect(refusal(false, 'member', 'admin')).not.toBeNull();
    expect(refusal(false, 'vice', 'member')).toBeNull();
    expect(refusal(true, 'admin', 'member')).toBeNull();
  });

  it('部員の役職のうち、管理は主将、罰の操作は主将と副務', () => {
    expect([canAdminister(as('captain')), canAdminister(as('vice'))]).toEqual([true, false]);
    expect([canManagePenalties(as('vice')), canManagePenalties(as('member'))]).toEqual([
      true,
      false,
    ]);
    expect(canAdminister(as('captain', false))).toBe(false);
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
