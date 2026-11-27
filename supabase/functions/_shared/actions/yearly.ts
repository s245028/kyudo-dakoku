// 代替わりと学年の繰り上げ（主将）
import {
  GRADES,
  parseStudentNos,
  planGenerationChange,
  planGradePromotion,
  toPracticeDate,
  type RosterMember,
} from '../../../../packages/core/src/index.ts';
import { requireCaptain, type RequestContext } from '../context.ts';
import { inTransaction, type Sql } from '../db.ts';
import { AppError } from '../errors.ts';
import { judgeDate } from '../judge.ts';
import { stringParam, type Params } from '../params.ts';
import { homeSnapshot, lockRoster } from '../store.ts';
import { ensureCaptainRemains } from './members.ts';

async function saveRoster(tx: Sql, members: readonly RosterMember[]) {
  for (const member of members) {
    await tx`update public.members set ${tx({
      grade: member.grade,
      status: member.status,
      role: member.role,
      retired_on: member.retiredOn,
    })} where id = ${member.id}`;
  }
}

export async function changeGeneration({ sql, userId, now }: RequestContext, params: Params) {
  const retiringGrade = GRADES.find((grade) => grade === params['retiringGrade']);
  if (!retiringGrade) throw new AppError('引退する学年を選んでください。');
  const today = toPracticeDate(now);

  const retired = await inTransaction(sql, async (tx) => {
    const members = await lockRoster(tx);
    const actor = await requireCaptain(tx, userId);
    const plan = planGenerationChange({
      members,
      retiringGrade,
      captainNos: parseStudentNos(stringParam(params, 'captainNos')),
      viceNos: parseStudentNos(stringParam(params, 'viceNos')),
      today,
    });
    if (!plan.ok) throw new AppError(plan.message);
    await saveRoster(tx, plan.value.updated);
    await ensureCaptainRemains(tx, actor);
    // 引退した人を、今日の出欠に反映する
    await judgeDate(tx, { date: today, now, memberIds: null });
    return plan.value.retiringIds.length;
  });
  return { retired, home: await homeSnapshot(sql, userId, today) };
}

export async function promoteGrades({ sql, userId, now }: RequestContext) {
  const today = toPracticeDate(now);

  const result = await inTransaction(sql, async (tx) => {
    const members = await lockRoster(tx);
    const actor = await requireCaptain(tx, userId);
    const [last] = await tx<{ year: number | null }[]>`
      select max(fiscal_year) as year from public.grade_promotions`;
    const plan = planGradePromotion({ members, today, lastFiscalYear: last?.year ?? null });
    if (!plan.ok) throw new AppError(plan.message);

    await tx`insert into public.grade_promotions ${tx({
      fiscal_year: plan.value.fiscalYear,
      executed_at: now,
      executed_by: actor.id,
    })}`;
    await saveRoster(tx, plan.value.updated);
    await ensureCaptainRemains(tx, actor);
    return {
      updated: plan.value.updated.length,
      graduated: plan.value.graduatingIds.length,
    };
  });
  return { ...result, home: await homeSnapshot(sql, userId, today) };
}
