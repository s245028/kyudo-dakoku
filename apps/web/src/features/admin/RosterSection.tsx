import {
  groupRoster,
  matchesMember,
  ROSTER_GROUP_LABELS,
  ROSTER_GROUPS,
  type RosterGroup,
} from '@kyudo/core';
import { useState } from 'react';
import { ChoiceRow } from '../../components/ChoiceRow.tsx';
import { loadRoster } from '../../lib/queries.ts';
import type { Home } from '../../lib/home.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { MemberCard } from './MemberCard.tsx';
import { PendingMember } from './PendingMember.tsx';

type RosterSectionProps = { viewerIsAdmin: boolean; onHome: (home: Home) => void };

export function RosterSection({ viewerIsAdmin, onHome }: RosterSectionProps) {
  const roster = useRemote(loadRoster);
  const action = useAction();
  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, async (reply) => {
      onHome(reply.home);
      await roster.reload();
    });
  const pending = roster.data?.filter((member) => !member.approved) ?? [];
  const approved = roster.data?.filter((member) => member.approved) ?? [];
  const [group, setGroup] = useState<RosterGroup>('active');
  const [query, setQuery] = useState('');
  const groups = groupRoster(approved);
  const searching = query.trim() !== '';
  // 検索するときは、分け方に関係なく探す
  const shown = searching
    ? ROSTER_GROUPS.flatMap((key) => groups[key]).filter((member) => matchesMember(member, query))
    : groups[group];
  const labels = Object.fromEntries(
    ROSTER_GROUPS.map((key) => [key, `${ROSTER_GROUP_LABELS[key]} ${groups[key].length}`]),
  ) as Record<RosterGroup, string>;

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || roster.error}
      </p>
      <h3>承認待ち（{pending.length}人）</h3>
      <ul className="list">
        {pending.length === 0 && <li className="empty">承認待ちの人はいません</li>}
        {pending.map((member) => (
          <PendingMember
            key={member.id}
            member={member}
            viewerIsAdmin={viewerIsAdmin}
            sending={action.sending}
            run={run}
          />
        ))}
      </ul>
      <h3>部員名簿（{approved.length}人）</h3>
      <input
        type="search"
        className="member-search"
        aria-label="名前か学生番号で探す"
        placeholder="名前か学生番号で探す"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!searching && (
        <ChoiceRow label="表示する部員" options={labels} value={group} onChange={setGroup} />
      )}
      <ul className="list roster-list">
        {!roster.data && !roster.error && <li className="empty">読み込み中…</li>}
        {roster.data && shown.length === 0 && <li className="empty">該当する人はいません</li>}
        {shown.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            viewerIsAdmin={viewerIsAdmin}
            sending={action.sending}
            run={run}
          />
        ))}
      </ul>
    </>
  );
}
