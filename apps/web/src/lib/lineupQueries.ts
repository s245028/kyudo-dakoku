// 立ち順の画面が使う読み込み。4役と管理者だけが読める
import type {
  Koma,
  Lineup,
  Part,
  Person,
  PracticeException,
  PracticeRule,
  Punch,
} from '@kyudo/core';
import { ApiError, callFunction, OFFLINE_MESSAGE } from './api.ts';

export type SavedLineup = Lineup & {
  part: Part;
  updatedAt: string;
  /** 保存した部員の名前。管理者ログインなら null */
  updatedBy: string | null;
};

type LineupDayReply = {
  date: string;
  members: Person[];
  rules: PracticeRule[];
  koma: (Koma & { memberId: string })[];
  exceptions: Pick<PracticeException, 'date' | 'memberId' | 'kind' | 'approval'>[];
  punches: { memberId: string; at: string; kind: Punch['kind']; canceledAt: string | null }[];
  lineups: SavedLineup[];
};

/** 今日の参加者を決めるのに必要なものと、保存した立ち順。連絡の理由は含まれない。 */
export async function loadLineupDay() {
  const reply = await callFunction<LineupDayReply | null>('lineup_day');
  // 役職が変わって、作れなくなった
  if (!reply) throw new ApiError(OFFLINE_MESSAGE);
  const { koma, exceptions, punches, ...day } = reply;
  return {
    ...day,
    komaByMember: new Map(koma.map(({ memberId, ...own }) => [memberId, own])),
    exceptions: exceptions.map((exception): PracticeException => ({
      ...exception,
      memo: '',
      contactedAt: null,
    })),
    punches: punches.map((punch): Punch => ({
      ...punch,
      at: new Date(punch.at),
      canceledAt: punch.canceledAt === null ? null : new Date(punch.canceledAt),
    })),
  };
}
