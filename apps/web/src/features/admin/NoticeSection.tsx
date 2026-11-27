import { addDays } from '@kyudo/core';
import { useCallback } from 'react';
import type { Home } from '../../lib/home.ts';
import { loadNotices, loadRoster, loadRules, type StoredException } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { NoticeRow } from './NoticeRow.tsx';

/** 判断を変えられるように、さかのぼって出す日数 */
const HISTORY_DAYS = 7;

/** 部員からの欠席・遅刻の連絡と、コマ変更の申請。承認待ちを承認・却下する。 */
export function NoticeSection({
  today,
  onHome,
  readOnly = false,
}: {
  today: string;
  onHome: (home: Home) => void;
  /** 副務は見るだけで、承認と却下はできない */
  readOnly?: boolean;
}) {
  const load = useCallback(async () => {
    const since = addDays(today, -HISTORY_DAYS);
    const [members, notices, rules] = await Promise.all([
      loadRoster(),
      loadNotices(since),
      loadRules(),
    ]);
    return { members, notices, rules };
  }, [today]);
  const { data, error, reload } = useRemote(load);
  const action = useAction();

  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, async ({ home }) => {
      onHome(home);
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
      <h3>{HISTORY_DAYS}日前からの連絡</h3>
      {list(
        notices.filter((notice) => notice.approval !== 'pending'),
        'ありません',
      )}
    </>
  );
}
