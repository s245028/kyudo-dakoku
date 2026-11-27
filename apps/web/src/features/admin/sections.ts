/** 管理画面の項目 */
export const SECTIONS = {
  notices: '連絡',
  lineup: '立ち順',
  roster: '名簿',
  exceptions: '臨時変更',
  attendance: '出欠',
  settings: '設定',
  yearly: '代替わり',
  export: '書き出し',
} as const;

export type SectionId = keyof typeof SECTIONS;

/** はじめて開くときの項目。承認を待つものがあれば先に出し、なければ毎日使う立ち順。 */
export function firstSection(pending: { notices: number; members: number }): SectionId {
  if (pending.notices > 0) return 'notices';
  return pending.members > 0 ? 'roster' : 'lineup';
}
