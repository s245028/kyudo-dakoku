import { describeTally, HIT_CATEGORY_LABELS, toClockTime } from '@kyudo/core';
import { ConfirmButton } from '../../../components/ConfirmButton.tsx';
import type { StoredHitRecord } from '../../../lib/hitQueries.ts';

/** 射数と的中数だけで入れた区分の記録 */
export function TotalRecord({
  record,
  sending,
  onEdit,
  onShots,
  onDelete,
}: {
  record: StoredHitRecord;
  sending: boolean;
  onEdit: () => void;
  onShots: () => void;
  onDelete: () => void;
}) {
  return (
    <section>
      <div className="entry-head">
        <h3>{HIT_CATEGORY_LABELS[record.category]}（合計で入力）</h3>
        <p className="save-state">保存済み {toClockTime(new Date(record.updatedAt))}</p>
      </div>
      <p className="total-figure">{describeTally(record)}</p>
      <button type="button" className="secondary" onClick={onEdit}>
        射数と的中数を直す
      </button>
      <ConfirmButton
        label="一射ずつの入力に置き換える"
        className="secondary"
        disabled={sending}
        onConfirm={onShots}
      />
      <ConfirmButton
        label="この区分の記録を削除"
        className="secondary"
        disabled={sending}
        onConfirm={onDelete}
      />
    </section>
  );
}
