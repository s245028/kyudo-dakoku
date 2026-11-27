import { useDraggable, useDroppable } from '@dnd-kit/core';
import { TagFace, type Tag } from './TagFace.tsx';
import { dropIds } from './dropIds.ts';

/** `on` は入れ替え、`before` と `after` はその札の前後に入れる */
export type DropHint = 'on' | 'before' | 'after';

/** 押して選ぶことも、ドラッグすることも、上に別の札を落とすこともできる札 */
export function DraggableTag({
  tag,
  selected,
  hint,
  onClick,
}: {
  tag: Tag;
  selected: boolean;
  /** この札の上にドラッグしている */
  hint?: DropHint | null;
  onClick: () => void;
}) {
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: tag.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: dropIds.tag(tag.id) });
  const className = [
    'tag tag-draggable',
    selected && 'tag-highlighted',
    isDragging && 'tag-dragging',
    hint && !isDragging && `tag-drop-${hint}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      type="button"
      className={className}
      aria-pressed={selected}
      onClick={onClick}
      // 長押しで出るメニューは、ドラッグの邪魔になる
      onContextMenu={(event) => event.preventDefault()}
      {...listeners}
    >
      <TagFace tag={tag} />
    </button>
  );
}

/** 列の最後の「＋」。押すか、札を落とすと移る */
export function DropSlot({
  column,
  label,
  onClick,
}: {
  column: number;
  label: string;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropIds.column(column) });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={isOver ? 'tag tag-empty tag-over' : 'tag tag-empty'}
      aria-label={label}
      onClick={onClick}
    >
      ＋
    </button>
  );
}
