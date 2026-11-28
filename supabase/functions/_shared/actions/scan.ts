import {
  autoPenaltyKey,
  checkLocation,
  decideScan,
  describeFirstEntry,
  isEntranceQr,
  punchRefusal,
  resolvePracticePlan,
  toClockTime,
  toPracticeDate,
  undoRefusal,
  type Position,
} from '../../../../packages/core/src/index.ts';
import { requireEnrolledMember, type RequestContext } from '../context.ts';
import { inTransaction } from '../db.ts';
import { AppError, refuseIf } from '../errors.ts';
import { judgeDate } from '../judge.ts';
import { objectParam, stringParam, type Params } from '../params.ts';
import { notifyPenaltyWaiting } from '../push.ts';
import {
  homeSnapshot,
  loadExceptions,
  loadKoma,
  loadPunches,
  loadRules,
  loadSettings,
  type StoredPunch,
} from '../store.ts';

function positionParam(params: Params): Position | null {
  const { latitude, longitude, accuracyMeters } = objectParam(params, 'position');
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = typeof accuracyMeters === 'number' ? accuracyMeters : 0;
  return { latitude, longitude, accuracyMeters: Number.isFinite(accuracy) ? accuracy : 0 };
}

/** 入口の QR を読んだときの打刻。在室中なら退室、そうでなければ入室。 */
export async function scan(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const date = toPracticeDate(now);
  const result = await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    refuseIf(punchRefusal(member));

    const settings = await loadSettings(tx);
    if (!isEntranceQr(stringParam(params, 'qr'), settings)) {
      throw new AppError('道場の入口QRではありません。');
    }
    const location = checkLocation(settings, positionParam(params));
    if (!location.ok) throw new AppError(location.message);

    const punches = await loadPunches(tx, date, [member.id]);
    const decision = decideScan({
      punches,
      now,
      duplicateScanSeconds: settings.duplicateScanSeconds,
    });
    if (decision.action === 'ignore') {
      const { kind, at } = decision.last;
      return { duplicate: true as const, kind, time: toClockTime(at) };
    }

    const [punch] = await tx<{ id: number }[]>`
      insert into public.punches ${tx({
        member_id: member.id,
        punched_at: now,
        kind: decision.kind,
        distance_m: location.distanceMeters,
        via: 'app',
      })} returning id::int`;

    let entry: ReturnType<typeof describeFirstEntry> = null;
    let penaltyAdded = false;
    let penaltyPending = false;
    let addedPenalties = 0;
    if (decision.firstInToday) {
      const plan = resolvePracticePlan({
        date,
        memberId: member.id,
        rules: await loadRules(tx),
        koma: (await loadKoma(tx, [member.id])).get(member.id) ?? null,
        exceptions: await loadExceptions(tx, date),
      });
      entry = describeFirstEntry({ member, date, plan, enteredAt: now });
      // 遅刻と、練習後の入室（欠席）の罰は、打刻した時点でつける（夜の判定を待たない）
      if (entry && (entry.lateMinutes > 0 || entry.missed)) {
        ({ addedPenalties } = await judgeDate(tx, { date, now, memberIds: [member.id] }));
        const [penalty] = await tx`
          select 1 from public.penalties where auto_key = ${autoPenaltyKey(date, member.id)}`;
        penaltyAdded = penalty !== undefined;
        const [pending] = await tx`select 1 from public.attendance
          where practice_date = ${date} and member_id = ${member.id}
            and final_result in ('late_pending', 'absent_pending')`;
        penaltyPending = pending !== undefined;
      }
    }
    return {
      duplicate: false as const,
      id: punch!.id,
      kind: decision.kind,
      time: toClockTime(now),
      message: entry?.message ?? '',
      lateMinutes: entry?.lateMinutes ?? 0,
      missed: entry?.missed ?? false,
      penaltyAdded,
      penaltyPending,
      addedPenalties,
      undoSeconds: settings.undoSeconds,
    };
  });
  if (!result.duplicate && result.addedPenalties > 0) await notifyPenaltyWaiting(context);
  // 最新の在室・罰を一緒に返し、アプリが取り直さなくて済むようにする
  return { scan: result, home: await homeSnapshot(sql, userId, date) };
}

/** 自分の打刻の取り消し。入室を取り消したら、その日を判定し直して罰を合わせる。 */
export async function undoScan(context: RequestContext, params: Params) {
  const { sql, userId, now } = context;
  const id = Number(params['punchId']);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError('記録が見つかりません');

  const added = await inTransaction(sql, async (tx) => {
    const member = await requireEnrolledMember(tx, userId);
    refuseIf(punchRefusal(member));
    const [punch] = await tx<(StoredPunch & { date: string })[]>`
      select id::int, member_id as "memberId", punched_at as at, kind,
        canceled_at as "canceledAt", practice_date::text as date
      from public.punches where id = ${id} for update`;
    const { undoSeconds } = await loadSettings(tx);
    refuseIf(undoRefusal({ punch: punch ?? null, memberId: member.id, now, undoSeconds }));

    await tx`update public.punches set canceled_at = ${now} where id = ${id}`;
    if (punch!.kind !== 'in') return 0;
    const judged = await judgeDate(tx, { date: punch!.date, now, memberIds: [member.id] });
    return judged.addedPenalties;
  });
  if (added > 0) await notifyPenaltyWaiting(context);
  return { home: await homeSnapshot(sql, userId, toPracticeDate(now)) };
}
