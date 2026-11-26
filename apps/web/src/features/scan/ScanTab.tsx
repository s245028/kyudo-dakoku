import { useCallback, useEffect, useRef, useState } from 'react';
import { callAction, messageOf } from '../../lib/api.ts';
import type { Home, HomeData, HomeView } from '../../lib/home.ts';
import { failureFeedback, successFeedback } from './feedback.ts';
import { JoinCard } from './JoinCard.tsx';
import { currentPosition, type ScanPosition } from './position.ts';
import { ResultCard } from './ResultCard.tsx';
import type { ScanOutcome, ScanResponse } from './scanResult.ts';
import { TodayCard } from './TodayCard.tsx';
import { useQrScanner } from './useQrScanner.ts';

type ScanTabProps = {
  home: HomeData;
  view: HomeView;
  /** このタブを表示している */
  active: boolean;
  onHome: (home: Home) => void;
  onShowPenalties: () => void;
};

type Phase = { type: 'scanning' } | { type: 'sending' } | ScanOutcome;

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

export function ScanTab({ home, view, active, onHome, onShowPenalties }: ScanTabProps) {
  const [phase, setPhase] = useState<Phase>({ type: 'scanning' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const positionRef = useRef<Promise<ScanPosition | null> | null>(null);
  const visible = usePageVisible();
  const { approved } = home.member;
  const scanning = approved && active && visible && phase.type === 'scanning';
  const { requiresLocation } = home.settings;

  // アプリを開き直したら、前の結果を閉じてカメラに戻る
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) {
        setPhase((current) => (current.type === 'sending' ? current : { type: 'scanning' }));
      }
    };
    document.addEventListener('visibilitychange', reset);
    return () => document.removeEventListener('visibilitychange', reset);
  }, []);

  // 読み取りと並行して位置を取る
  useEffect(() => {
    positionRef.current = scanning && requiresLocation ? currentPosition() : null;
  }, [scanning, requiresLocation]);

  const send = useCallback(
    async (qr: string) => {
      setPhase({ type: 'sending' });
      try {
        const position = await positionRef.current;
        const reply = await callAction<{ scan: ScanResponse; home: Home }>('scan', {
          qr,
          position,
        });
        successFeedback(reply.scan.kind === 'in');
        setPhase({ type: 'recorded', scan: reply.scan });
        onHome(reply.home);
      } catch (cause) {
        failureFeedback();
        setPhase({ type: 'failed', message: messageOf(cause) });
      }
    },
    [onHome],
  );

  const cameraError = useQrScanner(videoRef, scanning, (qr) => void send(qr));
  const showCamera = approved && (phase.type === 'scanning' || phase.type === 'sending');

  return (
    <>
      {!approved && (
        <p className="notice">
          <strong>主将の承認待ちです。</strong>
          <br />
          承認されると、ここから打刻できるようになります。先に「自分」タブで授業のコマを入力しておいてください。
        </p>
      )}
      <TodayCard view={view} onShowPenalties={onShowPenalties} />
      <div className="scanner" hidden={!showCamera}>
        <video ref={videoRef} playsInline muted />
        <div className="scanner-frame" />
      </div>
      {showCamera && (
        <p className="scanner-message">
          {phase.type === 'sending'
            ? '記録しています…'
            : (cameraError ?? '入口のQRコードを枠に合わせてください')}
        </p>
      )}
      {showCamera && cameraError && (
        <button type="button" className="secondary" onClick={() => location.reload()}>
          カメラをもう一度起動する
        </button>
      )}
      {phase.type !== 'scanning' && phase.type !== 'sending' && (
        <ResultCard
          outcome={phase}
          memberName={home.member.name}
          onAgain={() => setPhase({ type: 'scanning' })}
          onUndone={(next) => {
            setPhase({ type: 'undone' });
            onHome(next);
          }}
        />
      )}
      {view.retired && (
        <JoinCard
          days={view.joinDays}
          noticeLeadMinutes={home.settings.noticeLeadMinutes}
          onChanged={onHome}
        />
      )}
    </>
  );
}
