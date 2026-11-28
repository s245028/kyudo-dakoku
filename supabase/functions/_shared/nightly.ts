import {
  hasDoubledToday,
  isNightlyDue,
  planAutoCheckout,
  toPracticeDate,
  type OpenPenalty,
} from '../../../packages/core/src/index.ts';
import { inTransaction, type Sql } from './db.ts';
import { judgeDate } from './judge.ts';
import { notifyPenaltyWaiting, type PushSender } from './push.ts';
import { loadPunches, loadSettings, lockRoster } from './store.ts';

export type NightlyResult =
  { ran: false } | { ran: true; date: string; checkedOut: number; judged: number };

type NightlyWork = { result: NightlyResult; penaltyWaiting: boolean };

const SKIPPED: NightlyWork = { result: { ran: false }, penaltyWaiting: false };

/**
 * 夜の処理：在室中の人を自動退室にして、今日の出欠を判定する。1日に1回だけ動く。
 * 罰がついたか、今日倍になった罰があれば、副務に知らせる。
 */
export async function runNightly(
  sql: Sql,
  now: Date,
  sendPush?: PushSender,
): Promise<NightlyResult> {
  const { result, penaltyWaiting } = await inTransaction(sql, async (tx): Promise<NightlyWork> => {
    const settings = await loadSettings(tx);
    if (!isNightlyDue(now, settings.autoCheckoutTime)) return SKIPPED;

    const date = toPracticeDate(now);
    const [claimed] = await tx`
      insert into public.nightly_runs ${tx({ practice_date: date, ran_at: now })}
      on conflict (practice_date) do nothing returning practice_date`;
    if (!claimed) return SKIPPED;

    // 打刻と同時に動いても食い違わないよう、部員をロックしてから打刻を読む
    const roster = await lockRoster(tx);
    const punches = await loadPunches(
      tx,
      date,
      roster.map((member) => member.id),
    );
    const checkouts = planAutoCheckout({
      date,
      punches,
      autoCheckoutTime: settings.autoCheckoutTime,
    });
    for (const { memberId, at } of checkouts) {
      await tx`insert into public.punches ${tx({
        member_id: memberId,
        punched_at: at,
        kind: 'auto_out',
        via: 'auto',
      })}`;
    }
    const { judged, addedPenalties } = await judgeDate(tx, { date, now, memberIds: null });
    const [open] = await tx<{ penalties: OpenPenalty[] }[]>`
      select private.open_penalties(null) as penalties`;
    const doubled = hasDoubledToday(open!.penalties, date, settings.penaltyDoublingDays);
    // 立ち順は当日分だけを残す
    await tx`delete from public.lineups where practice_date < ${date}`;
    await tx`update public.nightly_runs
      set checked_out = ${checkouts.length}, judged = ${judged}
      where practice_date = ${date}`;
    return {
      result: { ran: true, date, checkedOut: checkouts.length, judged },
      penaltyWaiting: addedPenalties > 0 || doubled,
    };
  });
  if (penaltyWaiting) await notifyPenaltyWaiting({ sql, now, sendPush });
  return result;
}
