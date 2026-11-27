import { taskSuggestions } from '@kyudo/core';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { callFunction } from '../../lib/api.ts';
import { countPenalties, type CountedPenalty, type Home, type Penalty } from '../../lib/home.ts';
import { loadPenaltyTypes, loadRecentTaskContents, loadRoster } from '../../lib/queries.ts';
import { useAction } from '../../lib/useAction.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { AddPenaltyForm } from './AddPenaltyForm.tsx';
import { MyPenalties } from './MyPenalties.tsx';
import type { PenaltyOperations } from './operations.ts';
import { PenaltyRow } from './PenaltyRow.tsx';
import { TaskItem } from './TaskItem.tsx';
import { UnassignedTask } from './UnassignedTask.tsx';

const loadBoard = () => callFunction<Penalty[]>('penalty_board');

/** 副務・主将が罰を扱うときに使う一覧 */
const loadOfficerData = async () => {
  const [members, types, contents] = await Promise.all([
    loadRoster(),
    loadPenaltyTypes(),
    loadRecentTaskContents(),
  ]);
  return {
    members: members.filter(
      (member) => member.approved && ['active', 'retired'].includes(member.status),
    ),
    types: types.filter((type) => type.assignedBy === 'officer'),
    suggestions: taskSuggestions(contents),
  };
};
const loadNothing = () => Promise.resolve(null);

/** 罰の画面を見ている人。管理者は部員ではないので `memberId` が null */
export type PenaltyViewer = { memberId: string | null; officer: boolean; captain: boolean };

type PenaltyTabProps = {
  viewer: PenaltyViewer;
  /** 自分の罰。部員でなければ null */
  mine: CountedPenalty[] | null;
  today: string;
  doublingDays: number;
  onHome: (home: Home) => void;
};

export function PenaltyTab({ viewer, mine, today, doublingDays, onHome }: PenaltyTabProps) {
  const { officer, captain } = viewer;
  const board = useRemote(loadBoard);
  const officerData = useRemote(officer ? loadOfficerData : loadNothing);
  const action = useAction();
  const everyone = board.data && countPenalties(board.data, today, doublingDays);

  const operations: PenaltyOperations | null = officer
    ? {
        sending: action.sending,
        run: (name, params) =>
          action.run<{ home: Home }>(name, params, async (reply) => {
            onHome(reply.home);
            await Promise.all([board.reload(), officerData.reload()]);
          }),
      }
    : null;

  return (
    <>
      {mine && <MyPenalties penalties={mine} />}
      <p className="form-error" role="alert">
        {action.error || board.error || officerData.error}
      </p>
      {operations && officerData.data && (
        <>
          <AddPenaltyForm
            members={officerData.data.members}
            types={officerData.data.types}
            today={today}
            operations={operations}
          />
          <datalist id="task-suggestions">
            {officerData.data.suggestions.map((content) => (
              <option key={content} value={content} />
            ))}
          </datalist>
        </>
      )}
      <h3>罰がついている人（古い順）</h3>
      <ul className="list">
        {!everyone && !board.error && <li className="empty">読み込み中…</li>}
        {everyone?.length === 0 && <li className="empty">いま罰がついている人はいません</li>}
        {everyone?.map((penalty) => (
          <PenaltyRow
            key={penalty.id}
            penalty={penalty}
            mine={penalty.memberId === viewer.memberId}
          >
            {penalty.openTasks.map((task) => (
              <TaskItem key={task.id} task={task} operations={operations} />
            ))}
            {Array.from({ length: penalty.unassigned }, (_, index) => (
              <UnassignedTask key={index} penaltyId={penalty.id} operations={operations} />
            ))}
            {captain && operations && (
              <ConfirmButton
                label="この罰をまるごと消化済みにする"
                className="small secondary"
                disabled={operations.sending}
                onConfirm={() =>
                  void operations.run('admin-close-penalty', { penaltyId: penalty.id })
                }
              />
            )}
          </PenaltyRow>
        ))}
      </ul>
      <p className="hint">
        罰1個ごとに、副務が「やること」を決めます。終わったら証拠の画像を副務に送ってください。副務が確認すると、その罰が消えます。
        <br />
        残っている罰は、ついた日から{doublingDays}
        日ごとに2倍になります。増えた分のやることも副務が決めます。
      </p>
    </>
  );
}
