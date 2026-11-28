import { loadPenaltyTypes, loadSettings } from '../../lib/queries.ts';
import type { Home } from '../../lib/home.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { PenaltyTypesForm } from './PenaltyTypesForm.tsx';
import { SettingsForm } from './SettingsForm.tsx';

const loadConfiguration = async () => {
  const [settings, types] = await Promise.all([loadSettings(), loadPenaltyTypes()]);
  return { settings, types };
};

export function AppSettingsSection({ onHome }: { onHome: (home: Home) => void }) {
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
          <SettingsForm settings={data.settings} sending={action.sending} run={run} />
          <h3>罰の種類</h3>
          <PenaltyTypesForm types={data.types} sending={action.sending} run={run} />
        </>
      )}
    </>
  );
}
