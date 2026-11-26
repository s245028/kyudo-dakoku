import { loadLastPromotionYear, loadRoster } from '../../lib/queries.ts';
import type { Home } from '../../lib/home.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { GenerationChangeForm } from './GenerationChangeForm.tsx';
import { GradePromotionCard } from './GradePromotionCard.tsx';

const loadYearly = async () => {
  const [members, lastFiscalYear] = await Promise.all([loadRoster(), loadLastPromotionYear()]);
  return { members, lastFiscalYear };
};

export function YearlySection({ today, onHome }: { today: string; onHome: (home: Home) => void }) {
  const { data, error, reload } = useRemote(loadYearly);
  const action = useAction();
  const run = (name: string, params: object) =>
    action.run<{ home: Home }>(name, params, async (reply) => {
      onHome(reply.home);
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
          <h3>代替わり（引退・役職の交代）</h3>
          <GenerationChangeForm
            members={data.members}
            today={today}
            sending={action.sending}
            run={run}
          />
          <h3>学年の繰り上げ（4月）</h3>
          <GradePromotionCard
            members={data.members}
            lastFiscalYear={data.lastFiscalYear}
            today={today}
            sending={action.sending}
            run={run}
          />
        </>
      )}
    </>
  );
}
