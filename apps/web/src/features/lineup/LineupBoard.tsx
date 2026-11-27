import { GROUP_SIZE, lineupColumnName, type LineupFormat } from '@kyudo/core';

export type Tag = {
  id: string;
  name: string;
  /** 札の下に出す印（遅・欠など） */
  mark?: string;
};

type LineupBoardProps = {
  format: LineupFormat;
  columns: Tag[][];
  /** 強調する札（選んでいる札、自分の札） */
  highlighted?: string | null;
  /** 指定すると、札と空きを押せる */
  onTag?: (id: string) => void;
  onColumn?: (index: number) => void;
};

/** 木札を並べた板。右端が大前（先頭）で、列の中は上から引く順 */
export function LineupBoard(props: LineupBoardProps) {
  const { format, columns, highlighted, onTag, onColumn } = props;

  const tag = ({ id, name, mark }: Tag) => {
    const className = id === highlighted ? 'tag tag-highlighted' : 'tag';
    const content = (
      <>
        <span className="tag-name">{name}</span>
        {mark && <span className="tag-mark">{mark}</span>}
      </>
    );
    return onTag ? (
      <button
        key={id}
        type="button"
        className={className}
        aria-pressed={id === highlighted}
        onClick={() => onTag(id)}
      >
        {content}
      </button>
    ) : (
      <span key={id} className={className}>
        {content}
      </span>
    );
  };

  /** 札を移す先 */
  const slot = (index: number) =>
    onColumn && (
      <button
        type="button"
        className="tag tag-empty"
        aria-label={`${lineupColumnName(format, index)}に移す`}
        onClick={() => onColumn(index)}
      >
        ＋
      </button>
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
          <span className="board-label">{lineupColumnName(format, index)}</span>
          <div className="board-row">
            {column.map(tag)}
            {column.length < GROUP_SIZE && slot(index)}
          </div>
        </li>
      ))}
    </ol>
  );
}
