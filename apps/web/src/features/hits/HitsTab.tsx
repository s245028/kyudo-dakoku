import { useState } from 'react';
import { ChoiceRow } from '../../components/ChoiceRow.tsx';
import { useChanges } from '../../lib/useChanges.ts';
import { AnalysisView } from './analysis/AnalysisView.tsx';
import { EntryView } from './entry/EntryView.tsx';
import { RankingView } from './ranking/RankingView.tsx';

const VIEWS = { entry: '入力', ranking: '記録・順位', analysis: '分析' };

export type HitViewer = {
  /** 部員の id。管理者ログインは null で、記録はせず、見て直すだけ */
  memberId: string | null;
  approved: boolean;
  canCorrect: boolean;
};

export function HitsTab({
  viewer,
  startDate,
  today,
}: {
  viewer: HitViewer;
  /** 記録を始める日。決まっていなければ null */
  startDate: string | null;
  today: string;
}) {
  const [view, setView] = useState<keyof typeof VIEWS>('entry');
  const changes = useChanges('hits');
  const { memberId } = viewer;
  const shown = memberId ? view : 'ranking';

  if (!viewer.approved) {
    return <p className="empty">承認されると、的中を記録できます。</p>;
  }
  if (!startDate || startDate > today) {
    return (
      <p className="empty">
        {startDate
          ? `的中の記録は ${startDate} に始まります。`
          : '記録を始める日がまだ決まっていません。主将か管理者が、左上の3本線の「アプリの設定」で決めます。'}
      </p>
    );
  }

  return (
    <div className="stats hits">
      {memberId && (
        <ChoiceRow label="表示する内容" options={VIEWS} value={view} onChange={setView} />
      )}
      {memberId && shown === 'entry' && (
        <EntryView memberId={memberId} startDate={startDate} today={today} changes={changes} />
      )}
      {shown === 'ranking' && (
        <RankingView
          ownId={memberId}
          canCorrect={viewer.canCorrect}
          startDate={startDate}
          today={today}
          changes={changes}
        />
      )}
      {memberId && shown === 'analysis' && (
        <AnalysisView memberId={memberId} today={today} changes={changes} />
      )}
    </div>
  );
}
