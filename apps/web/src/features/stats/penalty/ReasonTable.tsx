import type { PenaltyStats } from '@kyudo/core';

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(1)}%`;

/** 理由ごとのつけた数と割合。棒の長さは、いちばん多い理由を基準にする */
export function ReasonTable({ reasons }: { reasons: PenaltyStats['byReason'] }) {
  if (reasons.length === 0) return <p className="empty">この期間につけた罰はありません。</p>;
  const total = reasons.reduce((sum, { added }) => sum + added, 0);
  const max = Math.max(...reasons.map(({ added }) => added));

  return (
    <table className="data-table">
      <caption>{'表2　理由ごとのつけた数（単位：個）'}</caption>
      <thead>
        <tr>
          <th scope="col">理由</th>
          <th scope="col">数</th>
          <th scope="col">割合</th>
        </tr>
      </thead>
      <tbody>
        {reasons.map(({ reason, added }) => (
          <tr key={reason}>
            <th scope="row">
              {reason}
              <svg className="table-bar" aria-hidden="true">
                <rect width={`${(added / max) * 100}%`} height="100%" />
              </svg>
            </th>
            <td>{added}</td>
            <td>{percent(added, total)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">合計</th>
          <td>{total}</td>
          <td>{percent(total, total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
