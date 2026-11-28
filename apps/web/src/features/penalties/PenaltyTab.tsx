import { callFunction } from '../../lib/api.ts';
import { countPenalties, type CountedPenalty, type Penalty } from '../../lib/home.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { MyPenalties } from './MyPenalties.tsx';
import { PenaltyList, type PenaltyViewer } from './PenaltyList.tsx';

const loadBoard = () => callFunction<Penalty[]>('penalty_board');

type PenaltyTabProps = {
  viewer: PenaltyViewer;
  /** 自分の罰。部員でなければ null */
  mine: CountedPenalty[] | null;
  today: string;
  doublingDays: number;
  /** 罰を扱える人（副務と管理者）が、操作の画面を開く */
  onManage?: (() => void) | undefined;
};

/** 自分の罰と、全員の残っている罰を見る */
export function PenaltyTab({ viewer, mine, today, doublingDays, onManage }: PenaltyTabProps) {
  const board = useRemote(loadBoard);
  const everyone = board.data && countPenalties(board.data, today, doublingDays);

  return (
    <>
      {mine && <MyPenalties penalties={mine} />}
      {onManage && (
        <button type="button" className="secondary" onClick={onManage}>
          罰の管理を開く（つける・割り当てる・消化する）
        </button>
      )}
      <p className="form-error" role="alert">
        {board.error}
      </p>
      <h3>罰がついている人（古い順）</h3>
      <PenaltyList
        penalties={everyone}
        viewer={viewer}
        operations={null}
        empty="いま罰がついている人はいません"
      />
    </>
  );
}
