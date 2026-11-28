import { loadRules } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { RulesForm } from './RulesForm.tsx';

/** 曜日ごとの集合・開始・終了の時刻 */
export function PracticeTimesSection() {
  const { data, error, reload } = useRemote(loadRules);
  const action = useAction();
  const run = (name: string, params: object) => action.run(name, params, reload);

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      {!data && !error && <p className="empty">読み込み中…</p>}
      {data && <RulesForm rules={data} sending={action.sending} run={run} />}
    </>
  );
}
