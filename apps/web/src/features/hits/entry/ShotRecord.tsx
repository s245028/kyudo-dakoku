import {
  countRows,
  displayRows,
  HIT_CATEGORY_LABELS,
  HIT_MAX_SHOTS,
  nextShot,
  SHOTS_PER_ROW,
  toClockTime,
  trimRows,
  type Shot,
  type ShotRow,
} from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../../components/ConfirmButton.tsx';
import type { StoredHitRecord } from '../../../lib/hitQueries.ts';
import {
  discardDraft,
  overwriteWithDraft,
  putDraft,
  type HitDraft,
  type HitTarget,
} from '../../../lib/hitSync.ts';

const MAX_ROWS = HIT_MAX_SHOTS / SHOTS_PER_ROW;
const SHOT_NAMES = { hit: '中り', miss: '外れ', none: '未入力' };

const nameOf = (shot: Shot) =>
  shot === 1 ? SHOT_NAMES.hit : shot === 0 ? SHOT_NAMES.miss : SHOT_NAMES.none;

function Mark({ shot }: { shot: Shot }) {
  if (shot === null) return null;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={shot ? 'shot-hit' : 'shot-miss'}>
      {shot ? <circle cx="16" cy="16" r="12" /> : <path d="M6 6l20 20M26 6L6 26" />}
    </svg>
  );
}

/** 一射ずつの入力。4射を1段にまとめる */
export function ShotRecord({
  target,
  record,
  draft,
}: {
  target: HitTarget;
  /** 保存されている記録。合計の記録を置き換えるときも渡す */
  record: StoredHitRecord | undefined;
  draft: HitDraft | undefined;
}) {
  /** 少なくとも出しておく段の数。足した段や、消して空になった段を残す */
  const [padding, setPadding] = useState(1);
  const stored: ShotRow[] = draft?.rows ?? record?.rows ?? [];
  const rows = displayRows(stored, padding);

  function change(next: ShotRow[], shown: number) {
    setPadding(shown);
    putDraft(target, trimRows(next), record?.revision ?? null);
  }

  const press = (row: number, column: number) =>
    change(
      rows.map((shots, r) =>
        r === row ? shots.map((shot, c) => (c === column ? nextShot(shot) : shot)) : shots,
      ),
      rows.length,
    );

  return (
    <section>
      <div className="entry-head">
        <h3>{HIT_CATEGORY_LABELS[target.category]}（一射ずつ）</h3>
        <p className="save-state" role="status">
          {draft && !draft.problem && '未保存（端末に残しています）'}
          {!draft && record && `保存済み ${toClockTime(new Date(record.updatedAt))}`}
        </p>
      </div>
      {draft?.problem && (
        <div className="notice" role="alert">
          <p>{draft.problem.message}</p>
          <div className="notice-actions">
            {draft.problem.conflict && (
              <ConfirmButton
                label="この端末の入力で上書き"
                className="small"
                onConfirm={() => overwriteWithDraft(target, record?.revision ?? null)}
              />
            )}
            <ConfirmButton
              label="保存されている内容に戻す"
              className="small secondary"
              onConfirm={() => discardDraft(target)}
            />
          </div>
        </div>
      )}
      <ol className="shot-rows">
        {rows.map((shots, row) => {
          const { shots: entered, hits } = countRows([shots]);
          return (
            // 段は位置で区別する
            <li key={row} className="shot-row">
              <span className="shot-number">{row + 1}</span>
              {shots.map((shot, column) => (
                <button
                  key={column}
                  type="button"
                  className="shot-cell"
                  aria-label={`${row + 1}段目の${column + 1}射目：${nameOf(shot)}`}
                  onClick={() => press(row, column)}
                >
                  <Mark shot={shot} />
                </button>
              ))}
              <b>{entered ? `${hits}中` : ''}</b>
              <ConfirmButton
                label="削除"
                className="shot-delete"
                disabled={rows.length === 1 && entered === 0}
                onConfirm={() =>
                  change(
                    rows.filter((_, index) => index !== row),
                    Math.max(1, rows.length - 1),
                  )
                }
              />
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="add-row"
        aria-label="4射の段を追加"
        disabled={rows.length >= MAX_ROWS}
        // 足した段は、入力するまで保存しない
        onClick={() => setPadding(rows.length + 1)}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" />
          <path d="M24 14v20M14 24h20" />
        </svg>
      </button>
    </section>
  );
}
