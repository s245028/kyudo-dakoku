import { rankDescending } from '@kyudo/core';
import { Fragment, useState, type ReactNode } from 'react';

export type RankRow<K extends string> = {
  id: string;
  name: string;
  values: Record<K, number>;
  /** 名前を押すと開く内容 */
  detail: ReactNode;
};

const FIRST_SHOWN = 10;

/** 順位の表。数の見出しを押すと、その数の大きい順に並べ直す。 */
export function RankTable<K extends string>({
  caption,
  columns,
  initial,
  rows,
  formats = {},
}: {
  caption: string;
  columns: Record<K, string>;
  /** はじめに並べる数 */
  initial: NoInfer<K>;
  rows: readonly RankRow<NoInfer<K>>[];
  /** 数のまま出さない列の表示 */
  formats?: Partial<Record<NoInfer<K>, (value: number) => string>>;
}) {
  const [sorted, setSorted] = useState<K>(initial);
  const [opened, setOpened] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const keys = Object.keys(columns) as K[];
  const ranked = rankDescending(
    [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    (row) => row.values[sorted],
  );
  const shown = all ? ranked : ranked.slice(0, FIRST_SHOWN);

  return (
    <>
      <table className="data-table rank-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="rank">
              順位
            </th>
            <th scope="col" className="name">
              氏名
            </th>
            {keys.map((key) => (
              <th
                key={key}
                scope="col"
                className={key === sorted ? 'sorted' : undefined}
                aria-sort={key === sorted ? 'descending' : undefined}
              >
                <button type="button" onClick={() => setSorted(key)}>
                  {columns[key]}
                  <span aria-hidden="true">{key === sorted ? '▼' : '▽'}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td className="rank">{row.rank}</td>
                <th scope="row" className="name">
                  <button
                    type="button"
                    aria-expanded={opened === row.id}
                    onClick={() => setOpened(opened === row.id ? null : row.id)}
                  >
                    {row.name}
                    <span aria-hidden="true">{opened === row.id ? '－' : '＋'}</span>
                  </button>
                </th>
                {keys.map((key) => (
                  <td key={key} className={key === sorted ? 'sorted' : undefined}>
                    {formats[key]?.(row.values[key]) ?? row.values[key]}
                  </td>
                ))}
              </tr>
              {opened === row.id && (
                <tr className="rank-detail">
                  <td colSpan={keys.length + 2}>{row.detail}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {ranked.length > FIRST_SHOWN && (
        <button type="button" className="secondary" onClick={() => setAll(!all)}>
          {all ? `上位${FIRST_SHOWN}人だけを表示` : `全員を表示（${ranked.length}人）`}
        </button>
      )}
    </>
  );
}
