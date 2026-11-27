import { adminOnlyRefusal, GRADE_LABELS } from '@kyudo/core';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import type { RunAction } from './types.ts';

export function PendingMember({
  member,
  viewerIsAdmin,
  sending,
  run,
}: {
  member: RosterEntry;
  viewerIsAdmin: boolean;
  sending: boolean;
  run: RunAction;
}) {
  const params = { memberId: member.id };
  const refusal = adminOnlyRefusal({ actorIsAdmin: viewerIsAdmin, targetRole: member.role });

  return (
    <li className="list-row">
      <span>
        <strong>{member.name}</strong>
        <small className="sub">
          {member.studentNo}・{GRADE_LABELS[member.grade]}
        </small>
        {refusal && <small className="sub">{refusal}</small>}
      </span>
      <span className="row-actions">
        <button
          type="button"
          className="small"
          disabled={sending || refusal !== null}
          onClick={() => void run('admin-approve', params)}
        >
          承認する
        </button>
        <ConfirmButton
          label="削除"
          className="small secondary"
          disabled={sending || refusal !== null}
          onConfirm={() => void run('admin-delete-pending', params)}
        />
      </span>
    </li>
  );
}
