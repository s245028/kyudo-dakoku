// 代替わり（10月ごろ）と学年の繰り上げ（4月）
import { fiscalYearOf, type PracticeDate } from './date.ts';
import { GRADE_LABELS, hasActingCaptain, type Grade, type Member, type Role } from './member.ts';
import { normalizeStudentNo } from './registration.ts';
import { invalid, type Validated } from './validation.ts';

export type RosterMember = Member & { studentNo: string; grade: Grade; role: Role };

export type GenerationChange = {
  /** 引退にする部員の id */
  retiringIds: string[];
  /** 変更がある部員の、変更後の値 */
  updated: RosterMember[];
};

/** 学生番号を並べた入力（カンマ・読点・空白区切り）を分ける。 */
export function parseStudentNos(value: string): string[] {
  return value
    .split(/[,、\s]+/)
    .map(normalizeStudentNo)
    .filter(Boolean);
}

/**
 * 指定した学年の現役部員を引退にし、新しい主将・副務に役職を移す。
 * 新しい主将・副務の指定が空なら、その役職は引退する人の分だけ外す。
 */
export function planGenerationChange(input: {
  members: readonly RosterMember[];
  retiringGrade: Grade;
  captainNos: readonly string[];
  viceNos: readonly string[];
  today: PracticeDate;
}): Validated<GenerationChange> {
  const { members, retiringGrade, captainNos, viceNos, today } = input;
  const retiring = members.filter(
    (member) => member.status === 'active' && member.grade === retiringGrade,
  );
  if (retiring.length === 0) {
    return invalid(`${GRADE_LABELS[retiringGrade]}の現役部員がいません。`);
  }
  const missing = [...captainNos, ...viceNos].filter(
    (studentNo) => !members.some((member) => member.studentNo === studentNo),
  );
  if (missing.length > 0) return invalid(`名簿にない学生番号があります：${missing.join(', ')}`);

  const retiringIds = new Set(retiring.map((member) => member.id));
  const after = members.map((member): RosterMember => {
    const next = { ...member };
    if (retiringIds.has(member.id)) {
      next.status = 'retired';
      next.retiredOn = today;
      next.role = 'member';
    }
    if (captainNos.length > 0 && member.role === 'captain') next.role = 'member';
    if (viceNos.length > 0 && member.role === 'vice') next.role = 'member';
    if (captainNos.includes(member.studentNo)) next.role = 'captain';
    if (viceNos.includes(member.studentNo)) next.role = 'vice';
    return next;
  });
  if (!hasActingCaptain(after)) {
    return invalid('主将がいなくなります。承認済みの在籍者を新しい主将に指定してください。');
  }

  return {
    ok: true,
    value: {
      retiringIds: [...retiringIds],
      updated: after.filter((next, index) => {
        const before = members[index]!;
        return next.status !== before.status || next.role !== before.role;
      }),
    },
  };
}

const NEXT_GRADE: Partial<Record<Grade, Grade>> = { B1: 'B2', B2: 'B3', B3: 'B4', M1: 'M2' };

export type GradePromotion = {
  fiscalYear: number;
  updated: RosterMember[];
  graduatingIds: string[];
};

/** 学年を1つ上げる。4年と院2年は卒業にする。年度ごとに1回だけ。現役・引退は変えない。 */
export function planGradePromotion(input: {
  members: readonly RosterMember[];
  today: PracticeDate;
  /** 最後に実行した年度。未実行なら null */
  lastFiscalYear: number | null;
}): Validated<GradePromotion> {
  const fiscalYear = fiscalYearOf(input.today);
  if (input.lastFiscalYear !== null && input.lastFiscalYear >= fiscalYear) {
    return invalid(`${fiscalYear}年度の学年の繰り上げは、すでに実行しています。`);
  }
  const graduatingIds: string[] = [];
  const after = input.members.map((member): RosterMember => {
    if (member.status === 'graduated' || member.status === 'suspended') return member;
    const grade = NEXT_GRADE[member.grade];
    if (grade) return { ...member, grade };
    graduatingIds.push(member.id);
    return { ...member, status: 'graduated' };
  });
  if (!hasActingCaptain(after)) {
    return invalid('主将がいなくなります。先に主将を交代してください。');
  }
  return {
    ok: true,
    value: {
      fiscalYear,
      graduatingIds,
      updated: after.filter((member, index) => member !== input.members[index]),
    },
  };
}
