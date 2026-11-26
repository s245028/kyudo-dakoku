import { loadRoster } from '../../lib/queries.ts';
import type { Home } from '../../lib/home.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { MemberCard } from './MemberCard.tsx';
import { PendingMember } from './PendingMember.tsx';

export function RosterSection({ onHome }: { onHome: (home: Home) => void }) {
  const roster = useRemote(loadRoster);
  const action = useAction();
  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, async (reply) => {
      onHome(reply.home);
      await roster.reload();
    });
  const pending = roster.data?.filter((member) => !member.approved) ?? [];
  const approved = roster.data?.filter((member) => member.approved) ?? [];

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || roster.error}
      </p>
      <h3>承認待ち（{pending.length}人）</h3>
      <ul className="list">
        {pending.length === 0 && <li className="empty">承認待ちの人はいません</li>}
        {pending.map((member) => (
          <PendingMember key={member.id} member={member} sending={action.sending} run={run} />
        ))}
      </ul>
      <h3>部員名簿（{approved.length}人）</h3>
      <ul className="list">
        {!roster.data && !roster.error && <li className="empty">読み込み中…</li>}
        {approved.map((member) => (
          <MemberCard key={member.id} member={member} sending={action.sending} run={run} />
        ))}
      </ul>
    </>
  );
}
