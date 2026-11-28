import type { Gender } from '@kyudo/core';

/** 順位や集計で見る部員 */
export type Target = 'all' | Gender;

export const TARGET_OPTIONS: readonly { value: Target; label: string }[] = [
  { value: 'all', label: '全体' },
  { value: 'male', label: '男子' },
  { value: 'female', label: '女子' },
];
