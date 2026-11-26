import {
  isNightlyDue,
  planAutoCheckout,
  toPracticeDate,
} from '../../../packages/core/src/index.ts';
import { inTransaction, type Sql } from './db.ts';
import { judgeDate } from './judge.ts';
import { loadPunches, loadSettings, lockRoster } from './store.ts';

export type NightlyResult =
  { ran: false } | { ran: true; date: string; checkedOut: number; judged: number };

/** 夜の処理：在室中の人を自動退室にして、今日の出欠を判定する。1日に1回だけ動く。 */
export async function runNightly(sql: Sql, now: Date): Promise<NightlyResult> {
  return inTransaction(sql, async (tx): Promise<NightlyResult> => {
    const settings = await loadSettings(tx);
    if (!isNightlyDue(now, settings.autoCheckoutTime)) return { ran: false };

    const date = toPracticeDate(now);
    const [claimed] = await tx`
      insert into public.nightly_runs ${tx({ practice_date: date, ran_at: now })}
      on conflict (practice_date) do nothing returning practice_date`;
    if (!claimed) return { ran: false };

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
    const judged = await judgeDate(tx, { date, now, memberIds: null });
    await tx`update public.nightly_runs
      set checked_out = ${checkouts.length}, judged = ${judged}
      where practice_date = ${date}`;
    return { ran: true, date, checkedOut: checkouts.length, judged };
  });
}
