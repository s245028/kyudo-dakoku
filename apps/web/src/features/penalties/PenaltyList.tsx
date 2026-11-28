import { ownPenaltyRefusal } from '@kyudo/core';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { CountedPenalty } from '../../lib/home.ts';
import type { PenaltyOperations } from './operations.ts';
import { PenaltyRow } from './PenaltyRow.tsx';
import { TaskItem } from './TaskItem.tsx';
import { UnassignedTask } from './UnassignedTask.tsx';

/** 罰を見ている人。管理者ログインは部員ではないので `memberId` が null */
export type PenaltyViewer = { memberId: string | null; admin: boolean };

/** 残っている罰の一覧。`operations` がなければ見るだけ */
export function PenaltyList({
  penalties,
  viewer,
  operations,
  empty,
}: {
  /** 読み込み中は null */
  penalties: CountedPenalty[] | null;
  viewer: PenaltyViewer;
  operations: PenaltyOperations | null;
  empty: string;
}) {
  return (
    <ul className="list">
      {!penalties && <li className="empty">読み込み中…</li>}
      {penalties?.length === 0 && <li className="empty">{empty}</li>}
      {penalties?.map((penalty) => {
        const refusal = ownPenaltyRefusal({
          actorId: viewer.memberId,
          actorIsAdmin: viewer.admin,
          ownerId: penalty.memberId,
        });
        return (
          <PenaltyRow
            key={penalty.id}
            penalty={penalty}
            mine={penalty.memberId === viewer.memberId}
          >
            {penalty.openTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                operations={operations}
                completable={refusal === null}
              />
            ))}
            {Array.from({ length: penalty.unassigned }, (_, index) => (
              <UnassignedTask key={index} penaltyId={penalty.id} operations={operations} />
            ))}
            {operations && refusal && <p className="penalty-own">{refusal}</p>}
            {operations && !refusal && penalty.paid === 0 && (
              <ConfirmButton
                label="つけ間違いを取り消す"
                className="small secondary"
                disabled={operations.sending}
                onConfirm={() => void operations.run('cancel-penalty', { penaltyId: penalty.id })}
              />
            )}
          </PenaltyRow>
        );
      })}
    </ul>
  );
}
