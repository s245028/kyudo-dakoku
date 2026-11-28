import type { OfficerSection } from '@kyudo/core';

/** 役職の画面の項目の名前 */
export const SECTION_LABELS: Record<OfficerSection, string> = {
  notices: '事前連絡',
  lineup: '立ち順',
  attendance: '出欠',
  penalties: '罰の管理',
  clubSchedule: '部全体の予定',
  memberSchedule: '部員ごとの予定',
  roster: '名簿',
  stats: '集計',
  export: '書き出し',
  practiceTimes: '練習の時間',
  appSettings: 'アプリの設定',
  yearly: '代替わり・学年の繰り上げ',
};

/** 項目の一覧での分け方 */
export const SECTION_GROUPS: readonly { label: string; sections: readonly OfficerSection[] }[] = [
  { label: '毎日', sections: ['notices', 'lineup', 'attendance', 'penalties'] },
  { label: '予定', sections: ['clubSchedule', 'memberSchedule'] },
  { label: '部員と記録', sections: ['roster', 'stats', 'export'] },
  { label: '設定', sections: ['practiceTimes', 'appSettings'] },
  { label: '年に1回ほど', sections: ['yearly'] },
];

/**
 * はじめて開くときの項目。承認を待つものがあれば先に出し、なければ毎日使う立ち順。
 * `allowed` はその人が開ける項目で、空でないこと。
 */
export function firstSection(
  allowed: readonly OfficerSection[],
  pending: { notices: number; members: number },
): OfficerSection {
  const preferred: OfficerSection[] = [
    ...(pending.notices > 0 ? (['notices'] as const) : []),
    ...(pending.members > 0 ? (['roster'] as const) : []),
    'lineup',
  ];
  return preferred.find((section) => allowed.includes(section)) ?? allowed[0] ?? 'lineup';
}
