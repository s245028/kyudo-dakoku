import { planGradePromotion } from '@kyudo/core';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import type { RunAction } from '../../lib/useAction.ts';

type GradePromotionCardProps = {
  members: RosterEntry[];
  lastFiscalYear: number | null;
  today: string;
  sending: boolean;
  run: RunAction;
};

export function GradePromotionCard(props: GradePromotionCardProps) {
  const { members, lastFiscalYear, today, sending, run } = props;
  const plan = planGradePromotion({ members, today, lastFiscalYear });
  const graduating = plan.ok
    ? members.filter((member) => plan.value.graduatingIds.includes(member.id))
    : [];

  return (
    <div className="form">
      {plan.ok ? (
        <p className="sub">
          {plan.value.fiscalYear}年度分です。{plan.value.updated.length - graduating.length}
          人の学年を1つ上げ、{graduating.length}人（
          {graduating.map((member) => member.name).join('、') || 'なし'}
          ）を卒業にします。現役・引退の状態は変わりません。大学院に進んで続ける人は、あとで名簿を直してください。
        </p>
      ) : (
        <p className="sub">{plan.message}</p>
      )}
      {lastFiscalYear !== null && <p className="sub">前回の実行：{lastFiscalYear}年度</p>}
      <ConfirmButton
        label="学年を1つ上げる"
        disabled={sending || !plan.ok}
        onConfirm={() => void run('promote-grades', {})}
      />
    </div>
  );
}
