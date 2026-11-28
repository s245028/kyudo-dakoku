import type { Poster, PosterRow } from '@kyudo/core';
import { describe, expect, it } from 'vitest';
import { posterSheet } from './posterSheet.ts';

const row = (rank: number, name: string): PosterRow => ({ rank, name, shots: 40, hits: 30 });

const poster = (columns: Poster['columns'], longestName = 4): Poster => ({
  longestName,
  title: '2026年11月　的中率順',
  subtitle: '島根大学弓道部',
  metric: 'rate',
  columns,
  note: '注',
});

const valueOf = (cell: unknown) =>
  cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell;

describe('張り出しの表計算', () => {
  it('男女を左右に並べ、人数の少ない欄は空ける', () => {
    const { data, widths } = posterSheet(
      poster([
        { heading: '男子', rows: [row(1, '甲'), row(2, '乙')] },
        { heading: '女子', rows: [row(1, '丙')] },
      ]),
    );

    expect(widths).toHaveLength(11);
    expect(data.slice(3).map((cells) => cells.map(valueOf))).toEqual([
      ['男子', null, null, null, null, null, '女子', null, null, null, null],
      [
        ...['順位', '氏名', '射数', '的中', '的中率'],
        null,
        '順位',
        '氏名',
        '射数',
        '的中',
        '的中率',
      ],
      [1, '甲', 40, 30, 0.75, null, 1, '丙', 40, 30, 0.75],
      [2, '乙', 40, 30, 0.75, null, null, null, null, null, null],
      [],
      ['注', null, null, null, null, null, null, null, null, null, null],
    ]);
  });

  it('長い名前があれば、氏名の列を広げる', () => {
    const { widths } = posterSheet(poster([{ heading: null, rows: [row(1, '甲')] }], 20));

    expect(widths[1]).toBe(43);
  });

  it('1つの欄で見出しがなければ、見出しの行を出さない', () => {
    const { data, widths } = posterSheet(poster([{ heading: null, rows: [row(1, '甲')] }]));

    expect(widths).toHaveLength(5);
    expect(valueOf(data[3]?.[0])).toBe('順位');
  });
});
