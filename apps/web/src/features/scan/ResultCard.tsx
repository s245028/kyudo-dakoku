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
  onAgain: () => void;
  onUndone: (home: Home) => void;
};

export function ResultCard({ outcome, memberName, onAgain, onUndone }: ResultCardProps) {
  return (
    <div className={`result result-${toneOf(outcome)}`} role="status">
      {outcome.type === 'recorded' && (
        <Recorded scan={outcome.scan} memberName={memberName} onUndone={onUndone} />
      )}
      {outcome.type === 'undone' && (
        <>
          <p className="result-type result-type-small">取り消しました</p>
          <p className="result-note">必要なら、もう一度読み取ってください</p>
        </>
      )}
      {outcome.type === 'failed' && (
        <>
          <p className="result-type result-type-small">記録できません</p>
          <p className="result-note">{outcome.message}</p>
        </>
      )}
      <button type="button" onClick={onAgain}>
        もう一度読み取る
      </button>
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
        <p className="result-note">直前に記録済みのため、今回の読み取りは無視しました</p>
      ) : (
        <>
          <p className={scan.lateMinutes > 0 ? 'result-judge result-judge-late' : 'result-judge'}>
            {scan.message}
            {scan.penaltyAdded && '　罰がつきました（罰タブで確認）'}
          </p>
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
