import { taskSuggestions } from '@kyudo/core';
import { callFunction } from '../../lib/api.ts';
import { countPenalties, type Home, type Penalty } from '../../lib/home.ts';
import { loadPenaltyTypes, loadRecentTaskContents, loadRoster } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { AddPenaltyForm } from './AddPenaltyForm.tsx';
import type { PenaltyOperations } from './operations.ts';
import { PenaltyList, type PenaltyViewer } from './PenaltyList.tsx';

/** 罰をつける・割り当てるときに使う内容 */
const loadData = async () => {
  const [board, members, types, contents] = await Promise.all([
    callFunction<Penalty[]>('penalty_board'),
    loadRoster(),
    loadPenaltyTypes(),
    loadRecentTaskContents(),
  ]);
  return {
    board,
    members: members.filter(
      (member) => member.approved && ['active', 'retired'].includes(member.status),
    ),
    types: types.filter((type) => type.assignedBy === 'officer'),
    suggestions: taskSuggestions(contents),
  };
};

/** 副務と管理者の、罰の操作 */
export function PenaltyManage({
  viewer,
  today,
  doublingDays,
  leaderMultiplier,
  onHome,
}: {
  viewer: PenaltyViewer;
  today: string;
  doublingDays: number;
  /** 上4役の罰の倍率 */
  leaderMultiplier: number;
  onHome: (home: Home) => void;
}) {
  const { data, error, reload } = useRemote(loadData);
  const action = useAction();
  const operations: PenaltyOperations = {
    sending: action.sending,
    run: (name, params) =>
      action.run<{ home: Home }>(name, params, async (reply) => {
        onHome(reply.home);
        await reload();
      }),
  };
  const penalties = data && countPenalties(data.board, today, doublingDays);
  const waiting = penalties?.filter((penalty) => penalty.unassigned > 0) ?? null;
  const assigned = penalties?.filter((penalty) => penalty.unassigned === 0) ?? null;

  return (
    <>
      <p className="form-error" role="alert">
        {action.error || error}
      </p>
      {data && (
        <>
          <AddPenaltyForm
            members={data.members}
            types={data.types}
            today={today}
            leaderMultiplier={leaderMultiplier}
            operations={operations}
          />
          <datalist id="task-suggestions">
            {data.suggestions.map((content) => (
              <option key={content} value={content} />
            ))}
          </datalist>
        </>
      )}
      <h3>割り当て待ち（古い順）</h3>
      <PenaltyList
        penalties={waiting}
        viewer={viewer}
        operations={operations}
        empty="割り当て待ちの罰はありません"
      />
      <h3>割り当て済み（古い順）</h3>
      <PenaltyList
        penalties={assigned}
        viewer={viewer}
        operations={operations}
        empty="割り当て済みの罰はありません"
      />
      <p className="hint">
        証拠の画像を確認したら「消化済み」を2回押します。自分の罰は、管理者でなければ消化できません。残っている罰は、ついた日から
        {doublingDays}
        日ごとに2倍になります。
      </p>
    </>
  );
}
