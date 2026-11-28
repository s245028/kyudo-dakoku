import { totalRemaining, type CountedPenalty } from '../../lib/home.ts';

/** 自分の残りの罰と、やること */
export function MyPenalties({ penalties }: { penalties: CountedPenalty[] }) {
  const total = totalRemaining(penalties);
  if (total === 0) {
    return (
      <div className="my-penalties">
        <p className="my-penalties-total">あなたの罰はありません</p>
      </div>
    );
  }
  const soonest = Math.min(...penalties.map((penalty) => penalty.daysToDouble));

  return (
    <div className="my-penalties my-penalties-open">
      <p className="my-penalties-total">あなたの罰：残り{total}個</p>
      <p className="my-penalties-note">
        終わったら証拠画像を副務に送ってください。あと{soonest}日で残りが2倍になります。
      </p>
      <ul>
        {penalties.flatMap((penalty) => [
          ...penalty.openTasks.map((task) => <li key={task.id}>{task.content}</li>),
          ...Array.from({ length: penalty.unassigned }, (_, index) => (
            <li key={`${penalty.id}-${index}`} className="unassigned">
              やることは副務が決めます（{penalty.reason}）
            </li>
          )),
        ])}
      </ul>
    </div>
  );
}
