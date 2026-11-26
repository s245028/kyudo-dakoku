import { GRADE_LABELS } from '@kyudo/core';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import type { RunAction } from './types.ts';

export function PendingMember({
  member,
  sending,
  run,
}: {
  member: RosterEntry;
  sending: boolean;
  run: RunAction;
}) {
  const params = { memberId: member.id };

  return (
    <li className="list-row">
      <span>
        <strong>{member.name}</strong>
        <small className="sub">
          {member.studentNo}・{GRADE_LABELS[member.grade]}
        </small>
      </span>
      <span className="row-actions">
        <button
          type="button"
          className="small"
          disabled={sending}
          onClick={() => void run('admin-approve', params)}
        >
          承認する
        </button>
        <ConfirmButton
          label="削除"
          className="small secondary"
          disabled={sending}
          onConfirm={() => void run('admin-delete-pending', params)}
        />
      </span>
    </li>
  );
}
