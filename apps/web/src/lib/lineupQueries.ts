// 立ち順の画面が使う読み込み。主将と管理者だけが読める
import type { Koma, Lineup, Part, Person, PracticeException, Punch } from '@kyudo/core';
import { loadExceptionsSince, loadRoster, loadRules, read } from './queries.ts';
import { supabase } from './supabase.ts';

export type SavedLineup = Lineup & { part: Part };

type PunchReply = {
  memberId: string;
  at: string;
  kind: Punch['kind'];
  canceledAt: string | null;
};

const loadKoma = () =>
  read<(Koma & { memberId: string })[]>(() =>
    supabase().from('koma').select('memberId:member_id, mon4, mon5, tue4, tue5, thu4, thu5'),
  );

const loadPunchesOn = (date: string) =>
  read<PunchReply[]>(() =>
    supabase()
      .from('punches')
      .select('memberId:member_id, at:punched_at, kind, canceledAt:canceled_at')
      .eq('practice_date', date)
      .order('punched_at')
      .order('id'),
  );

const loadLineupsOn = (date: string) =>
  read<SavedLineup[]>(() =>
    supabase().from('lineups').select('part, format, groups, published').eq('practice_date', date),
  );

/** その日の参加者を決めるのに必要なものと、保存した立ち順 */
export async function loadLineupDay(date: string) {
  const [roster, rules, koma, exceptions, punches, lineups] = await Promise.all([
    loadRoster(),
    loadRules(),
    loadKoma(),
    loadExceptionsSince(date),
    loadPunchesOn(date),
    loadLineupsOn(date),
  ]);
  const members: Person[] = roster;
  return {
    members,
    rules,
    komaByMember: new Map(koma.map(({ memberId, ...own }) => [memberId, own])),
    exceptions: exceptions
      .filter((exception) => exception.date === date)
      .map(({ contactedAt, ...exception }): PracticeException => ({
        ...exception,
        contactedAt: contactedAt === null ? null : new Date(contactedAt),
      })),
    punches: punches.map((punch): Punch => ({
      ...punch,
      at: new Date(punch.at),
      canceledAt: punch.canceledAt === null ? null : new Date(punch.canceledAt),
    })),
    lineups,
  };
}
