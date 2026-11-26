import { callFunction } from '../../lib/api.ts';
import { countPenalties, type HomeData, type HomeView, type Penalty } from '../../lib/home.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { MyPenalties } from './MyPenalties.tsx';
import { PenaltyRow } from './PenaltyRow.tsx';

const loadBoard = () => callFunction<Penalty[]>('penalty_board');

export function PenaltyTab({ home, view }: { home: HomeData; view: HomeView }) {
  const { data, error } = useRemote(loadBoard);
  const everyone = data && countPenalties(data, view.today, home.settings.penaltyDoublingDays);

  return (
    <>
      <MyPenalties penalties={view.penalties} />
      <h3>罰がついている人（古い順）</h3>
      <p className="form-error" role="alert">
        {error}
      </p>
      <ul className="list">
        {!everyone && !error && <li className="empty">読み込み中…</li>}
        {everyone?.length === 0 && <li className="empty">いま罰がついている人はいません</li>}
        {everyone?.map((penalty) => (
          <PenaltyRow key={penalty.id} penalty={penalty} mine={penalty.memberId === home.member.id}>
            {penalty.openTasks.map((task) => (
              <p className="task" key={task.id}>
                <span className="task-content">{task.content}</span>
              </p>
            ))}
            {Array.from({ length: penalty.unassigned }, (_, index) => (
              <p className="task task-unassigned" key={index}>
                やることは副務が決めます
              </p>
            ))}
          </PenaltyRow>
        ))}
      </ul>
      <p className="hint">
        罰1個ごとに、副務が「やること」を決めます。終わったら証拠の画像を副務に送ってください。副務が確認すると、その罰が消えます。
        <br />
        残っている罰は、ついた日から{home.settings.penaltyDoublingDays}
        日ごとに2倍になります。増えた分のやることも副務が決めます。
      </p>
    </>
  );
}
