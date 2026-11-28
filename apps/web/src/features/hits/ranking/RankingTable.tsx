import { formatHitRate, type MemberHits } from '@kyudo/core';
import type { Ref } from 'react';

type Row = MemberHits & { rank?: number };

/** 順位の表。順位のない人は「―」 */
export function RankingTable({
  caption,
  rows,
  ownId,
  ownRow,
  nameOf,
  onSelect,
}: {
  /** 読み上げ用の表の題 */
  caption: string;
  rows: readonly Row[];
  ownId: string | null;
  ownRow: Ref<HTMLTableRowElement>;
  nameOf: (memberId: string) => string;
  onSelect: (memberId: string) => void;
}) {
  return (
    <table className="data-table ranking-table" aria-label={caption}>
      <thead>
        <tr>
          <th scope="col">順位</th>
          <th scope="col">氏名</th>
          <th scope="col">射数</th>
          <th scope="col">的中</th>
          <th scope="col">的中率</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const own = row.memberId === ownId;
          return (
            <tr key={row.memberId} ref={own ? ownRow : undefined} className={own ? 'own' : ''}>
              <td>{row.rank ?? '―'}</td>
              <th scope="row">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onSelect(row.memberId)}
                >
                  {nameOf(row.memberId)}
                </button>
              </th>
              <td>{row.shots}</td>
              <td>{row.hits}</td>
              <td>{formatHitRate(row)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
