import { shortDate, type PenaltyDetail, type PenaltyStats } from '@kyudo/core';
import type { DirectoryEntry } from '../../../lib/queries.ts';
import { RankTable } from '../RankTable.tsx';

const COLUMNS = { added: 'つけた', done: '消化', remaining: '残り' };

function Details({ details }: { details: readonly PenaltyDetail[] }) {
  return (
    <ul className="penalty-details">
      {details.map((detail) => (
        <li key={detail.id}>
          <span>{shortDate(detail.date)}</span>
          <span>{detail.reason}</span>
          <span>
            基本{detail.baseCount}個・期間内の消化{detail.done}個・残り{detail.remaining}個
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 部員ごとの数。名前を押すと、罰の内訳を出す */
export function MemberTable({
  byMember,
  members,
}: {
  byMember: PenaltyStats['byMember'];
  members: readonly DirectoryEntry[];
}) {
  if (byMember.length === 0) return <p className="empty">当てはまる部員はいません。</p>;

  return (
    <RankTable
      caption="表3　部員ごとの罰の数（単位：個）"
      columns={COLUMNS}
      initial="added"
      rows={byMember.map(({ memberId, details, ...values }) => ({
        id: memberId,
        name: members.find(({ id }) => id === memberId)?.name ?? '不明',
        values,
        detail: <Details details={details} />,
      }))}
    />
  );
}
