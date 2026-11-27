import { useState } from 'react';
import type { PenaltyOperations } from './operations.ts';

/** やることが決まっていない罰1個。副務はここで割り当てる */
export function UnassignedTask({
  penaltyId,
  operations,
}: {
  penaltyId: string;
  operations: PenaltyOperations | null;
}) {
  const [content, setContent] = useState('');

  if (!operations) return <div className="task task-unassigned">やることは副務が決めます</div>;

  return (
    <form
      className="task task-unassigned"
      onSubmit={(event) => {
        event.preventDefault();
        void operations
          .run('assign-task', { penaltyId, content })
          .then((ok) => ok && setContent(''));
      }}
    >
      <input
        aria-label="やること"
        value={content}
        maxLength={60}
        list="task-suggestions"
        placeholder="やることを入力（例：的貼り3個）"
        required
        onChange={(event) => setContent(event.target.value)}
      />
      <button type="submit" className="small" disabled={operations.sending}>
        割り当てる
      </button>
    </form>
  );
}
