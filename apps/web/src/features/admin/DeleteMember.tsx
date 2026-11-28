import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';

/** 部員の削除。元に戻せないので、確認のチェックを入れてから2回押す */
export function DeleteMember({
  member,
  sending,
  run,
}: {
  member: RosterEntry;
  sending: boolean;
  run: RunAction;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="form delete-member">
      <p className="sub">
        削除すると、{member.name}
        さんの打刻・出欠・罰・予定と連絡・コマ表も消え、元に戻せません。退部した人の記録を残すには、状態を「休部・退部」にしてください。
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        記録も消えることを確認した
      </label>
      <ConfirmButton
        label="この部員を削除する"
        className="secondary"
        disabled={sending || !agreed}
        onConfirm={() =>
          void run('admin-delete-member', { memberId: member.id, deleteRecords: true })
        }
      />
    </div>
  );
}
