// 張り出し用の紙を、表計算の1枚の形にする
import { hitRate, type Poster, type PosterRow } from '@kyudo/core';
import type { Cell, SheetData } from 'write-excel-file/browser';

const HEADINGS = ['順位', '氏名', '射数', '的中', '的中率'];
/** 列の幅（半角の文字数）。氏名の列は、長い名前が1行に収まる幅まで広げる */
const ONE_COLUMN_WIDTHS = [8, 28, 12, 12, 14] as const;
const TWO_COLUMN_WIDTHS = [5, 15, 6, 6, 8] as const;
const NAME_PADDING = 3;
const GAP_WIDTH = 2;
const TITLE_SIZE = 18;
const NOTE_HEIGHT = 32;
const HIGHLIGHTED_RANKS = 3;

const thin = { bottomBorderStyle: 'thin', bottomBorderColor: '#999999' } as const;
const heavy = { bottomBorderStyle: 'medium', bottomBorderColor: '#000000' } as const;

function rowCells(row: PosterRow | undefined, metric: Poster['metric']): Cell[] {
  if (!row) return HEADINGS.map(() => null);
  const top = row.rank <= HIGHLIGHTED_RANKS ? ({ fontWeight: 'bold' } as const) : {};
  const strong = (key: Poster['metric']) =>
    key === metric ? ({ fontWeight: 'bold' } as const) : {};
  return [
    { value: row.rank, align: 'center', ...top, ...thin },
    { value: row.name, ...top, ...thin },
    { value: row.shots, ...top, ...strong('shots'), ...thin },
    { value: row.hits, ...top, ...strong('hits'), ...thin },
    { value: hitRate(row) ?? 0, format: '0.0%', ...top, ...strong('rate'), ...thin },
  ];
}

/** 欄を左右に並べるときは、間に空の列を置く */
const joined = (blocks: Cell[][]): Cell[] =>
  blocks.flatMap((block, index) => (index === 0 ? block : [null, ...block]));

export function posterSheet(poster: Poster): { data: SheetData; widths: number[] } {
  const { columns, metric, longestName } = poster;
  const [rank, name, ...figures] = columns.length === 1 ? ONE_COLUMN_WIDTHS : TWO_COLUMN_WIDTHS;
  // 全角の1文字は、半角の2文字ぶん
  const block = [rank, Math.max(name, Math.ceil(longestName * 2) + NAME_PADDING), ...figures];
  const widths = columns.length === 1 ? block : [...block, GAP_WIDTH, ...block];
  /** 全部の列をつないだ1行 */
  const wide = (value: string, style: object): Cell[] => [
    { value, columnSpan: widths.length, ...style },
    ...widths.slice(1).map(() => null),
  ];
  const headings = columns.some((column) => column.heading)
    ? [
        joined(
          columns.map((column): Cell[] => [
            {
              value: column.heading ?? '',
              columnSpan: HEADINGS.length,
              align: 'center',
              fontWeight: 'bold',
            },
            ...HEADINGS.slice(1).map(() => null),
          ]),
        ),
      ]
    : [];
  const length = Math.max(...columns.map((column) => column.rows.length));

  return {
    widths,
    data: [
      wide(poster.title, { align: 'center', fontWeight: 'bold', fontSize: TITLE_SIZE }),
      wide(poster.subtitle, { align: 'center' }),
      [],
      ...headings,
      joined(
        columns.map(() =>
          HEADINGS.map((value, index): Cell => ({
            value,
            fontWeight: 'bold',
            align: index === 1 ? 'left' : 'center',
            ...heavy,
          })),
        ),
      ),
      ...Array.from({ length }, (_, row) =>
        joined(columns.map((column) => rowCells(column.rows[row], metric))),
      ),
      [],
      wide(poster.note, { wrap: true, height: NOTE_HEIGHT, alignVertical: 'top' }),
    ],
  };
}
