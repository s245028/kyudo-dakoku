import { NOTICE_KIND_LABELS, type NoticeDay, type NoticeKind } from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';

const KINDS = Object.keys(NOTICE_KIND_LABELS) as NoticeKind[];

type NoticeActionsProps = {
  day: NoticeDay;
  sending: boolean;
  onWrite: (kind: NoticeKind) => void;
  onCancel: () => void;
};

/**
 * 練習日1日分の、欠席・遅刻の連絡の操作。まだ送っていなければ欠席と遅刻のボタン、
 * 送ったあとは1つのボタンにまとめて、押すと出し直しと取り消しを出す。
 */
export function NoticeActions({ day, sending, onWrite, onCancel }: NoticeActionsProps) {
  const [changing, setChanging] = useState(false);
  const cancel = day.canCancel && (
    <ConfirmButton
      label="連絡を取り消す"
      className="secondary"
      disabled={sending}
      onConfirm={onCancel}
    />
  );
  const write = (suffix: string) =>
    KINDS.map((kind) => (
      <button
        key={kind}
        type="button"
        className="secondary"
        disabled={sending}
        onClick={() => onWrite(kind)}
      >
        {NOTICE_KIND_LABELS[kind]}
        {suffix}
      </button>
    ));

  if (!day.notice) {
    return day.canSubmit && <div className="day-actions">{write('する')}</div>;
  }
  // 出し直せないときは、取り消しだけを出す
  if (!day.canSubmit) return cancel && <div className="day-actions">{cancel}</div>;
  if (!changing) {
    return (
      <button type="button" className="secondary" onClick={() => setChanging(true)}>
        連絡を変更・取り消す
      </button>
    );
  }
  return (
    <>
      <div className="day-actions">
        {write('で出し直す')}
        {cancel}
      </div>
      <button type="button" className="link-button" onClick={() => setChanging(false)}>
        閉じる
      </button>
    </>
  );
}
