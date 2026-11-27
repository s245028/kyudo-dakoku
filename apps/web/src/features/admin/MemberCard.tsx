import {
  adminOnlyRefusal,
  GRADE_LABELS,
  GRADES,
  MEMBER_STATUSES,
  ROLE_LABELS,
  ROLES,
  STATUS_LABELS,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import { Options } from './Options.tsx';
import type { RunAction } from './types.ts';

type MemberCardProps = {
  member: RosterEntry;
  viewerIsAdmin: boolean;
  sending: boolean;
  run: RunAction;
};

export function MemberCard({ member, viewerIsAdmin, sending, run }: MemberCardProps) {
  const [open, setOpen] = useState(false);
  const refusal = adminOnlyRefusal({ actorIsAdmin: viewerIsAdmin, targetRole: member.role });
  // 管理者でなければ、管理者の役職は選べない
  const roles = viewerIsAdmin ? ROLES : ROLES.filter((role) => role !== 'admin');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = Object.fromEntries(new FormData(event.currentTarget));
    if (await run('admin-update-member', { memberId: member.id, changes })) setOpen(false);
  }

  return (
    <li className="expandable">
      <button
        type="button"
        className="expand-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          <strong>{member.name}</strong>
          <small className="sub">
            {member.studentNo}・{GRADE_LABELS[member.grade]}
          </small>
        </span>
        <span className="sub">
          {member.role !== 'member' && `${ROLE_LABELS[member.role]}・`}
          {STATUS_LABELS[member.status]}
          {!member.linked && '・端末なし'}
        </span>
      </button>
      {open && refusal && <p className="row-note">{refusal}</p>}
      {open && !refusal && (
        <form className="form" onSubmit={(event) => void save(event)}>
          <label>
            名前
            <input name="name" defaultValue={member.name} maxLength={30} required />
          </label>
          <label>
            学年
            <select name="grade" defaultValue={member.grade}>
              <Options values={GRADES} labels={GRADE_LABELS} />
            </select>
          </label>
          <label>
            役職
            <select name="role" defaultValue={member.role}>
              <Options values={roles} labels={ROLE_LABELS} />
            </select>
          </label>
          <label>
            状態
            <select name="status" defaultValue={member.status}>
              <Options values={MEMBER_STATUSES} labels={STATUS_LABELS} />
            </select>
          </label>
          <label>
            引退日（引退のとき。空なら今日）
            <input type="date" name="retiredOn" defaultValue={member.retiredOn ?? ''} />
          </label>
          <button type="submit" disabled={sending}>
            保存
          </button>
          <ConfirmButton
            label="再登録を許可する（スマホを替えたとき）"
            className="secondary"
            disabled={sending || !member.linked}
            onConfirm={() => void run('admin-reset-device', { memberId: member.id })}
          />
        </form>
      )}
    </li>
  );
}
