import {
  GROUP_SIZE,
  groupPositionName,
  lineupColumnName,
  type GroupSize,
  type LineupFormat,
  type LineupTarget,
} from '@kyudo/core';
import { DraggableTag, DropSlot, type DropHint } from './DragTags.tsx';
import { TagFace, type Tag } from './TagFace.tsx';

type LineupBoardProps = {
  format: LineupFormat;
  columns: Tag[][];
  /** 立ちで空けておく人数。指定しなければ、並んでいる人数に合わせる */
  groupSize?: GroupSize;
  /** 強調する札（選んでいる札、自分の札） */
  highlighted?: string | null;
  /** 指定すると、札を押したりドラッグしたりして直せる（`DndContext` の中で使う） */
  editing?: {
    onTag: (id: string) => void;
    onSlot: (target: LineupTarget) => void;
    /** 札を移す先の「＋」を出す（札を選んでいる間と、ドラッグの間） */
    slots: boolean;
    /** ドラッグ中の札を、どの札のどこに落とすか */
    hint: { id: string; place: DropHint } | null;
  };
};

/** 木札を並べた板。右端が大前（先頭）で、的割りの列の中は上から引く順 */
export function LineupBoard(props: LineupBoardProps) {
  const { format, columns, highlighted, editing } = props;
  /** 立ちの横の位置の数。8か9 */
  const positions = Math.max(
    props.groupSize ?? GROUP_SIZE,
    ...columns.map((column) => column.length),
  );
  const tag = (face: Tag) =>
    editing ? (
      <DraggableTag
        key={face.id}
        tag={face}
        selected={face.id === highlighted}
        hint={editing.hint?.id === face.id ? editing.hint.place : null}
        onClick={() => editing.onTag(face.id)}
      />
    ) : (
      <span key={face.id} className={face.id === highlighted ? 'tag tag-highlighted' : 'tag'}>
        <TagFace tag={face} />
      </span>
    );

  /** 列の最後に足す場所 */
  const slot = (index: number) =>
    editing?.slots && (
      <DropSlot
        column={index}
        label={`${lineupColumnName(format, index)}に移す`}
        onClick={() => editing.onSlot({ type: 'column', index })}
      />
    );

  if (format === 'targets') {
    return (
      <ol className="board board-targets">
        {columns.map((column, index) => (
          <li key={index} className="board-column">
            <span className="board-label">{lineupColumnName(format, index)}</span>
            {column.map(tag)}
            {slot(index)}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="board board-groups">
      {columns.map((column, index) => (
        <li key={index}>
          <span className="board-group-name">{lineupColumnName(format, index)}</span>
          <div className={positions > GROUP_SIZE ? 'board-row board-row-wide' : 'board-row'}>
            {Array.from({ length: positions }, (_, at) => {
              const face = column[at];
              return (
                <div key={at} className="board-position">
                  <span className="board-label">
                    {face ? groupPositionName(at, column.length) : '\u00a0'}
                  </span>
                  {face ? tag(face) : at === column.length && slot(index)}
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
