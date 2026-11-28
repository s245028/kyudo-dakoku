import { countRows, HIT_CATEGORIES, type HitCategory, type HitTally } from '@kyudo/core';
import { useCallback, useEffect, useState } from 'react';
import { loadHitRecords } from '../../../lib/hitQueries.ts';
import { draftKey, subscribeSaved, type SaveReply } from '../../../lib/hitSync.ts';
import { useAction } from '../../../lib/useAction.ts';
import { useHitDrafts } from '../../../lib/useHitDrafts.ts';
import { useRemote } from '../../../lib/useRemote.ts';
import { BulkForm } from './BulkForm.tsx';
import { CategoryCards } from './CategoryCards.tsx';
import { ShotRecord } from './ShotRecord.tsx';
import { TotalRecord } from './TotalRecord.tsx';

/** 1人の1日分の記録を見て直す。人か日を変えるときは、`key` で作り直すこと */
export function DayEditor({
  memberId,
  date,
  own,
  changes,
}: {
  memberId: string;
  date: string;
  /** 本人の記録か。ほかの人の分は、訂正と削除だけができる */
  own: boolean;
  /** ほかで記録が変わるたびに増える数 */
  changes: number;
}) {
  const load = useCallback(() => loadHitRecords(memberId, date), [memberId, date]);
  const { data: records, error, reload, setData } = useRemote(load);
  const drafts = useHitDrafts();
  const action = useAction();
  const [selected, setSelected] = useState<HitCategory | null>(null);
  const [bulk, setBulk] = useState(false);
  /** 合計の記録を、一射ずつに置き換えている区分 */
  const [replacing, setReplacing] = useState<HitCategory | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (changes > 0) void reload();
  }, [changes, reload]);

  useEffect(
    () =>
      subscribeSaved((target, saved) => {
        if (target.memberId === memberId && target.date === date) setData(saved);
      }),
    [memberId, date, setData],
  );

  if (!records) {
    return <p className={error ? 'form-error' : 'empty'}>{error || '読み込み中…'}</p>;
  }

  const recordOf = (category: HitCategory) =>
    records.find((record) => record.category === category);
  const draftOf = (category: HitCategory) => drafts[draftKey({ memberId, date, category })];
  const tallies = Object.fromEntries(
    HIT_CATEGORIES.map((category): [HitCategory, HitTally] => {
      const draft = draftOf(category);
      return [category, draft ? countRows(draft.rows) : (recordOf(category) ?? countRows([]))];
    }),
  ) as Record<HitCategory, HitTally>;
  // はじめは、記録のある区分を開く
  const category =
    selected ?? HIT_CATEGORIES.find((candidate) => recordOf(candidate)) ?? HIT_CATEGORIES[0];
  const record = recordOf(category);
  const draft = draftOf(category);

  if (bulk) {
    return (
      <BulkForm
        memberId={memberId}
        date={date}
        own={own}
        records={records}
        onSaved={setData}
        onClose={() => setBulk(false)}
      />
    );
  }

  function remove(revision: number) {
    setMessage('');
    void action.run<SaveReply>(
      'save-hits',
      { memberId, date, entries: [{ category, delete: true, baseRevision: revision }] },
      (reply) => {
        setData(reply.records);
        if (reply.conflict) setMessage('ほかで記録が変わりました。今の内容を確かめてください。');
      },
    );
  }

  const showTotal = record?.mode === 'total' && !draft && replacing !== category;
  const nothing = !own && !record && !draft;

  return (
    <>
      <CategoryCards tallies={tallies} selected={category} onSelect={setSelected} />
      <button type="button" className="import-button" onClick={() => setBulk(true)}>
        採点簿などの記録を入力
      </button>
      <p className="form-error" role="alert">
        {action.error || message || error}
      </p>
      {nothing && <p className="empty">この区分の記録はありません</p>}
      {showTotal && (
        <TotalRecord
          record={record}
          sending={action.sending}
          onEdit={() => setBulk(true)}
          onShots={() => setReplacing(category)}
          onDelete={() => remove(record.revision)}
        />
      )}
      {!nothing && !showTotal && (
        <ShotRecord
          key={category}
          target={{ memberId, date, category }}
          record={record}
          draft={draft}
        />
      )}
    </>
  );
}
