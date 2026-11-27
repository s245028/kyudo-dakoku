// 札を落とす先の識別子と、板の上の場所の対応
import type { LineupTarget } from '@kyudo/core';

export const dropIds = {
  tag: (memberId: string) => `tag:${memberId}`,
  column: (index: number) => `column:${index}`,
  /** 入れていない人の置き場 */
  bench: 'bench',
};

export function targetOfDrop(id: string): LineupTarget | null {
  if (id === dropIds.bench) return { type: 'bench' };
  const [type, value] = id.split(':');
  if (!value) return null;
  if (type === 'tag') return { type: 'tag', memberId: value };
  return type === 'column' ? { type: 'column', index: Number(value) } : null;
}
