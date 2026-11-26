import { loadPenaltyTypes, loadRules, loadSettings } from '../../lib/queries.ts';
import type { Home } from '../../lib/home.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { PenaltyTypesForm } from './PenaltyTypesForm.tsx';
import { RulesForm } from './RulesForm.tsx';
import { SettingsForm } from './SettingsForm.tsx';

const loadConfiguration = async () => {
  const [settings, rules, types] = await Promise.all([
    loadSettings(),
    loadRules(),
    loadPenaltyTypes(),
  ]);
  return { settings, rules, types };
};

export function SettingsSection({ onHome }: { onHome: (home: Home) => void }) {
  const { data, error, reload } = useRemote(loadConfiguration);
  const action = useAction();
  const run = (name: string, params: object) =>
    action.run<{ home?: Home }>(name, params, async (reply) => {
      if (reply.home) onHome(reply.home);
      await reload();
    });

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      {!data && !error && <p className="empty">読み込み中…</p>}
      {data && (
        <>
          <h3>設定</h3>
          <SettingsForm settings={data.settings} sending={action.sending} run={run} />
          <h3>練習ルール</h3>
          <RulesForm rules={data.rules} sending={action.sending} run={run} />
          <h3>罰の種類</h3>
          <PenaltyTypesForm types={data.types} sending={action.sending} run={run} />
        </>
      )}
    </>
  );
}
