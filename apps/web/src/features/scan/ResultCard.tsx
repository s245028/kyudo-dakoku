import { PUNCH_LABELS } from '@kyudo/core';
import { useEffect, useState } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home } from '../../lib/home.ts';
import type { ScanOutcome, ScanResponse } from './scanResult.ts';

/** 取り消しの締め切りより少し早く、ボタンを隠す */
const UNDO_MARGIN_SECONDS = 10;
const UNDO_MIN_VISIBLE_SECONDS = 5;

type ResultCardProps = {
  outcome: ScanOutcome;
  memberName: string;
  onUndone: (home: Home) => void;
};

export function ResultCard({ outcome, memberName, onUndone }: ResultCardProps) {
  return (
    <div className={`result result-${toneOf(outcome)}`} role="status">
      {outcome.type === 'recorded' && (
        <Recorded scan={outcome.scan} memberName={memberName} onUndone={onUndone} />
      )}
      {outcome.type === 'undone' && (
        <>
          <p className="result-type result-type-small">取り消しました</p>
          <p className="result-note">今の打刻はなかったことになりました</p>
        </>
      )}
      {outcome.type === 'failed' && (
        <>
          <p className="result-type result-type-small">記録できません</p>
          <p className="result-note">{outcome.message}</p>
        </>
      )}
    </div>
  );
}

function toneOf(outcome: ScanOutcome): 'in' | 'out' | 'error' {
  if (outcome.type === 'failed') return 'error';
  return outcome.type === 'recorded' && outcome.scan.kind === 'in' ? 'in' : 'out';
}

function Recorded({
  scan,
  memberName,
  onUndone,
}: {
  scan: ScanResponse;
  memberName: string;
  onUndone: (home: Home) => void;
}) {
  return (
    <>
      <p className="result-type">{PUNCH_LABELS[scan.kind]}</p>
      <p className="result-time">{scan.time}</p>
      {scan.duplicate ? (
        <p className="result-note">
          直前に記録済みのため、今回の読み取りは無視しました。少し時間をあけて読み取ってください。
        </p>
      ) : (
        <>
          <p
            className={
              scan.lateMinutes > 0 || scan.missed
                ? 'result-judge result-judge-late'
                : 'result-judge'
            }
          >
            {scan.message}
            {scan.penaltyAdded && '　罰がつきました'}
            {scan.penaltyPending && '　連絡か申請が承認待ちのため、罰は保留しています'}
          </p>
          {scan.penaltyAdded && (
            <p className="result-note">
              やることは「罰」タブで確認し、終わったら証拠画像を副務に送ってください。
            </p>
          )}
          <p className="result-note">{memberName} さん</p>
          <UndoButton punchId={scan.id} undoSeconds={scan.undoSeconds} onUndone={onUndone} />
        </>
      )}
    </>
  );
}

function UndoButton({
  punchId,
  undoSeconds,
  onUndone,
}: {
  punchId: number;
  undoSeconds: number;
  onUndone: (home: Home) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const seconds = Math.max(UNDO_MIN_VISIBLE_SECONDS, undoSeconds - UNDO_MARGIN_SECONDS);
    const timer = setTimeout(() => setVisible(false), seconds * 1000);
    return () => clearTimeout(timer);
  }, [undoSeconds]);

  async function undo() {
    setSending(true);
    try {
      const { home } = await callAction<{ home: Home }>('undo-scan', { punchId });
      onUndone(home);
    } catch (cause) {
      setError(messageOf(cause));
      setSending(false);
    }
  }

  return (
    <>
      <p className="form-error" role="alert">
        {error}
      </p>
      {visible && (
        <button type="button" className="secondary" disabled={sending} onClick={() => void undo()}>
          取り消す
        </button>
      )}
    </>
  );
}
