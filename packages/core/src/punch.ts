export const PUNCH_KINDS = ['in', 'out', 'auto_out'] as const;
export type PunchKind = (typeof PUNCH_KINDS)[number];

export const PUNCH_LABELS: Record<PunchKind, string> = {
  in: '入室',
  out: '退室',
  auto_out: '自動退室',
};

export type Punch = {
  memberId: string;
  at: Date;
  kind: PunchKind;
  canceledAt: Date | null;
};

/** 取り消されていない打刻を、古い順に並べる。同じ時刻は渡された順のまま。 */
export function validPunches<T extends Punch>(punches: readonly T[]): T[] {
  return punches
    .filter((punch) => punch.canceledAt === null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
