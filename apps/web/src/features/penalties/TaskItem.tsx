import type { PenaltyTask } from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { PenaltyOperations } from './operations.ts';

/** 割り当て済みのやること。副務・主将は変更と消化ができる */
export function TaskItem({
  task,
  operations,
}: {
  task: PenaltyTask;
  operations: PenaltyOperations | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!operations) {
    return (
      <div className="task">
        <span className="task-content">{task.content}</span>
      </div>
    );
  }
  const { sending, run } = operations;

  if (draft !== null) {
    return (
      <form
        className="task"
        onSubmit={(event) => {
          event.preventDefault();
          void run('edit-task', { taskId: task.id, content: draft }).then(
            (ok) => ok && setDraft(null),
          );
        }}
      >
        <input
          aria-label="やることの内容"
          value={draft}
          maxLength={60}
          list="task-suggestions"
          required
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="small" disabled={sending}>
          保存
        </button>
      </form>
    );
  }
  return (
    <div className="task">
      <span className="task-content">{task.content}</span>
      <span className="task-actions">
        <button type="button" className="small secondary" onClick={() => setDraft(task.content)}>
          変更
        </button>
        <ConfirmButton
          label="消化済み"
          className="small"
          disabled={sending}
          onConfirm={() => void run('complete-task', { taskId: task.id })}
        />
      </span>
    </div>
  );
}
