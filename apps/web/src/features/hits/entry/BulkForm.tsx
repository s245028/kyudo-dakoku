import {
  countRows,
  formatHitRate,
  HIT_CATEGORIES,
  HIT_CATEGORY_LABELS,
  sumTallies,
  validateTally,
  type HitCategory,
  type HitTally,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '../../../components/ConfirmButton.tsx';
import { callAction, messageOf } from '../../../lib/api.ts';
import type { StoredHitRecord } from '../../../lib/hitQueries.ts';
import { discardDraft, draftKey, type SaveReply } from '../../../lib/hitSync.ts';
import { useHitDrafts } from '../../../lib/useHitDrafts.ts';
import { readBulk, storeBulk, valuesOf, type BulkValue, type BulkValues } from './bulkValues.ts';

const CONFLICT_MESSAGE = 'ほかで記録が変わりました。今の内容を確かめて、もう一度保存してください。';

type Built = { ok: true; entries: object[] } | { ok: false; message: string };

/** 欄の内容から、変える区分の依頼を作る。両方とも空なら、その区分の記録を消す */
function buildEntries(
  values: BulkValues,
  records: readonly StoredHitRecord[],
  open: readonly HitCategory[],
): Built {
  const entries: object[] = [];
  for (const category of open) {
    const { shots, hits, base } = values[category];
    const record = records.find((candidate) => candidate.category === category);
    if (shots === '' && hits === '') {
      if (record) entries.push({ category, delete: true, baseRevision: base });
      continue;
    }
    const tally = validateTally(
      shots === '' ? null : Number(shots),
      hits === '' ? null : Number(hits),
    );
    if (!tally.ok) {
      return { ok: false, message: `${HIT_CATEGORY_LABELS[category]}：${tally.message}` };
    }
    const same =
      record?.mode === 'total' &&
      record.shots === tally.value.shots &&
      record.hits === tally.value.hits;
    if (!same) entries.push({ category, mode: 'total', ...tally.value, baseRevision: base });
  }
  return { ok: true, entries };
}

/** 採点簿などの記録を写す。3区分を1つの画面で入れて、1回で保存する */
export function BulkForm({
  memberId,
  date,
  own,
  records,
  onSaved,
  onClose,
}: {
  memberId: string;
  date: string;
  /** 本人の記録か。ほかの人の分は、ある記録だけを直せる */
  own: boolean;
  records: StoredHitRecord[];
  onSaved: (records: StoredHitRecord[]) => void;
  onClose: () => void;
}) {
  const drafts = useHitDrafts();
  const [values, setValues] = useState(() => readBulk(memberId, date) ?? valuesOf(records));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const recordOf = (category: HitCategory) =>
    records.find((record) => record.category === category);
  const draftOf = (category: HitCategory) => drafts[draftKey({ memberId, date, category })];
  /** 一射ずつの記録があり、置き換えると決めていない区分 */
  const locked = (category: HitCategory) =>
    !values[category].replace &&
    (recordOf(category)?.mode === 'shots' || draftOf(category) !== undefined);
  const shown = HIT_CATEGORIES.filter((category) => own || recordOf(category));
  const open = shown.filter((category) => !locked(category));

  const tallyOf = (category: HitCategory): HitTally => {
    if (locked(category)) {
      const draft = draftOf(category);
      return draft ? countRows(draft.rows) : (recordOf(category) ?? { shots: 0, hits: 0 });
    }
    const tally = validateTally(Number(values[category].shots), Number(values[category].hits));
    return tally.ok ? tally.value : { shots: 0, hits: 0 };
  };
  const total = sumTallies(shown.map(tallyOf));

  function change(category: HitCategory, next: Partial<BulkValue>) {
    const updated = { ...values, [category]: { ...values[category], ...next } };
    setValues(updated);
    storeBulk(memberId, date, updated);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildEntries(values, records, open);
    if (!built.ok) return setError(built.message);
    if (built.entries.length === 0) return setError('変えた区分がありません。');
    setSending(true);
    setError('');
    try {
      const reply = await callAction<SaveReply>('save-hits', {
        memberId,
        date,
        entries: built.entries,
      });
      onSaved(reply.records);
      if (reply.conflict) {
        storeBulk(memberId, date, null);
        setValues(valuesOf(reply.records));
        setError(CONFLICT_MESSAGE);
        return;
      }
      // 置き換えた区分の、一射ずつの下書きは捨てる
      for (const category of open) discardDraft({ memberId, date, category });
      storeBulk(memberId, date, null);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="bulk" onSubmit={(event) => void save(event)} noValidate>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          storeBulk(memberId, date, null);
          onClose();
        }}
      >
        ‹ 保存せずに戻る
      </button>
      <h3>採点簿などの記録を入力</h3>
      <table className="data-table bulk-table">
        <thead>
          <tr>
            <th scope="col">区分</th>
            <th scope="col">射数</th>
            <th scope="col">的中</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((category) => (
            <tr key={category}>
              <th scope="row">{HIT_CATEGORY_LABELS[category]}</th>
              {locked(category) ? (
                <td colSpan={2}>
                  <strong>
                    {tallyOf(category).hits}中／{tallyOf(category).shots}射
                  </strong>
                  <small className="sub">一射ずつの記録があります</small>
                  <ConfirmButton
                    label="合計に置き換える"
                    className="small secondary"
                    onConfirm={() =>
                      change(category, {
                        replace: true,
                        base: recordOf(category)?.revision ?? null,
                      })
                    }
                  />
                </td>
              ) : (
                (['shots', 'hits'] as const).map((key) => (
                  <td key={key}>
                    <span className="unit-input">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label={`${HIT_CATEGORY_LABELS[category]}の${key === 'shots' ? '射数' : '的中数'}`}
                        value={values[category][key]}
                        onChange={(event) => change(category, { [key]: event.target.value })}
                      />
                      {key === 'shots' ? '射' : '中'}
                    </span>
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">この日の合計</th>
            <td colSpan={2}>
              {total.hits}中／{total.shots}射（{formatHitRate(total)}）
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="form-error" role="alert">
        {error}
      </p>
      <button type="submit" disabled={sending}>
        保存する
      </button>
      <p className="hint">保存すると上書きします。両方を空にした区分は削除します。</p>
    </form>
  );
}
