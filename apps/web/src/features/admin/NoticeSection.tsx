import { addDays } from '@kyudo/core';
import { useCallback } from 'react';
import type { Home } from '../../lib/home.ts';
import {
  loadJoins,
  loadNotices,
  loadRoster,
  loadRules,
  type RosterEntry,
  type StoredException,
} from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { JoinSection } from './JoinSection.tsx';
import { NoticeRow } from './NoticeRow.tsx';
import { ProxyNoticeForm } from './ProxyNoticeForm.tsx';

/** 判断を変えられるように、さかのぼって出す日数 */
const HISTORY_DAYS = 7;

/** 欠席・遅刻の連絡、コマ変更の申請、引退した人の参加。承認待ちを承認・却下する。 */
const canSendNotice = (member: RosterEntry) =>
  member.approved && (member.status === 'active' || member.status === 'retired');

export function NoticeSection({
  today,
  onHome,
  readOnly = false,
}: {
  today: string;
  onHome: (home: Home) => void;
  /** 副務は見るだけで、承認・却下も入力もできない */
  readOnly?: boolean;
}) {
  const load = useCallback(async () => {
    const since = addDays(today, -HISTORY_DAYS);
    const [members, notices, joins, rules] = await Promise.all([
      loadRoster(),
      loadNotices(since),
      loadJoins(today),
      loadRules(),
    ]);
    return { members, notices, joins, rules };
  }, [today]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();

  const run = (name: string, params: object) =>
    action.run<{ home?: Home }>(name, params, async ({ home }) => {
      if (home) onHome(home);
      await reload();
    });

  const list = (notices: StoredException[], empty: string) => (
    <ul className="list">
      {!data && !error && <li className="empty">読み込み中…</li>}
      {data && notices.length === 0 && <li className="empty">{empty}</li>}
      {notices.map((notice) => (
        <NoticeRow
          key={notice.id}
          notice={notice}
          rules={data?.rules ?? []}
          name={data?.members.find((member) => member.id === notice.memberId)?.name ?? '不明'}
          sending={action.sending}
          run={run}
          readOnly={readOnly}
        />
      ))}
    </ul>
  );
  const notices = data?.notices ?? [];
  const pending = notices.filter((notice) => notice.approval === 'pending');

  return (
    <>
      <div className="toolbar">
        <button type="button" className="small secondary" onClick={() => void reload()}>
          読み直す
        </button>
      </div>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      <h3>承認待ち{data && `（${pending.length}件）`}</h3>
      <p className="hint">
        {readOnly
          ? '承認と却下は主将が行います。承認か却下をするまで、その人の罰は保留します。'
          : '承認か却下をするまで、その人の罰は保留します。却下は、連絡や申請がないのと同じ扱いです。'}
      </p>
      {list(pending, '承認待ちはありません')}
      <h3>事前連絡</h3>
      {list(
        notices.filter((notice) => notice.approval !== 'pending'),
        'ありません',
      )}
      {!readOnly && (
        <ProxyNoticeForm
          members={data?.members.filter(canSendNotice) ?? []}
          today={today}
          sending={action.sending}
          run={run}
        />
      )}
      {data && (
        <JoinSection
          joins={data.joins}
          members={data.members}
          today={today}
          sending={action.sending}
          readOnly={readOnly}
          run={run}
        />
      )}
    </>
  );
}
