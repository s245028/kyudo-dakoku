import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  canInsertBeside,
  dropInLineup,
  type GroupSize,
  type Lineup,
  type LineupTarget,
} from '@kyudo/core';
import { useState } from 'react';
import { detectDrop } from './collision.ts';
import { DraggableTag, type DropHint } from './DragTags.tsx';
import { dropIds, targetOfDrop } from './dropIds.ts';
import { LineupBoard } from './LineupBoard.tsx';
import { TagFace, type Tag } from './TagFace.tsx';

/** 指で触れてからこの時間（ミリ秒）押し続けるとドラッグになる。すぐ動かすと画面が送られる */
const TOUCH_HOLD_MS = 200;
/** この距離（px）までのぶれは、押しただけとして扱う */
const MOVE_TOLERANCE_PX = 8;
/** 画面の上下の端からこの割合まで札を運ぶと、画面を送る。下の保存の欄に重ねると送れる幅 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.12 } };

type LineupCanvasProps = {
  draft: Lineup;
  /** 手で直すときの、1立ちの人数 */
  groupSize: GroupSize;
  /** 板にいない参加者 */
  bench: Tag[];
  tagOf: (memberId: string) => Tag;
  onChange: (groups: Lineup['groups']) => void;
  children?: React.ReactNode;
};

/**
 * 板と、入れていない人の置き場。札はドラッグして直す。
 * 札を押してから、入れ替える札か移す先を押しても直せる。
 */
export function LineupCanvas(props: LineupCanvasProps) {
  const { draft, groupSize, bench, tagOf, onChange, children } = props;
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** ドラッグ中の札を、どの札のどこに落とすか */
  const [hint, setHint] = useState<{ id: string; place: DropHint } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOVE_TOLERANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: MOVE_TOLERANCE_PX },
    }),
  );
  const placed = new Set(draft.groups.flat());
  const active = dragging ?? selected;

  function drop(memberId: string, target: LineupTarget) {
    setSelected(null);
    const groups = dropInLineup(draft.format, draft.groups, memberId, target, groupSize);
    if (groups !== draft.groups) onChange(groups);
  }

  /** いまの指の位置が指す、落とし先 */
  function targetOf(event: DragMoveEvent): LineupTarget | null {
    const hit = event.collisions?.[0];
    const target = hit && targetOfDrop(String(hit.id));
    if (!target || target.type !== 'tag') return target ?? null;
    const place = (hit.data as { place?: DropHint } | undefined)?.place;
    const beside =
      place !== 'on' &&
      canInsertBeside(
        draft.format,
        draft.groups,
        String(event.active.id),
        target.memberId,
        groupSize,
      );
    return { ...target, side: beside ? place : undefined };
  }

  function showHint(event: DragMoveEvent) {
    const target = targetOf(event);
    const next: { id: string; place: DropHint } | null =
      target?.type === 'tag' ? { id: target.memberId, place: target.side ?? 'on' } : null;
    setHint((current) =>
      current?.id === next?.id && current?.place === next?.place ? current : next,
    );
  }

  const finish = () => {
    setDragging(null);
    setHint(null);
  };

  function pick(memberId: string) {
    if (selected === null) return setSelected(memberId);
    if (selected === memberId) return setSelected(null);
    // どちらも板にない場合は、選び直すだけ
    if (!placed.has(selected) && !placed.has(memberId)) return setSelected(memberId);
    drop(selected, { type: 'tag', memberId });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detectDrop(draft.format)}
      autoScroll={AUTO_SCROLL}
      onDragStart={(event) => {
        setSelected(null);
        setDragging(String(event.active.id));
      }}
      onDragMove={showHint}
      onDragOver={showHint}
      onDragCancel={finish}
      onDragEnd={(event) => {
        finish();
        const target = targetOf(event);
        if (target) drop(String(event.active.id), target);
      }}
    >
      <LineupBoard
        format={draft.format}
        columns={draft.groups.map((group) => group.map(tagOf))}
        groupSize={groupSize}
        highlighted={selected}
        editing={{
          onTag: pick,
          onSlot: (target) => selected && drop(selected, target),
          slots: active !== null,
          hint,
        }}
      />
      {children}
      <Bench count={bench.length}>
        {bench.map((tag) => (
          <DraggableTag
            key={tag.id}
            tag={tag}
            selected={tag.id === selected}
            onClick={() => pick(tag.id)}
          />
        ))}
        {selected !== null && placed.has(selected) && (
          <button
            type="button"
            className="small secondary"
            onClick={() => drop(selected, { type: 'bench' })}
          >
            選んだ札を外す
          </button>
        )}
        {dragging !== null && placed.has(dragging) && (
          <span className="bench-guide">ここに置くと外れます</span>
        )}
      </Bench>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <span className="tag tag-ghost">
            <TagFace tag={tagOf(dragging)} />
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** 入れていない人の置き場。板の札をここに落とすと外れる */
function Bench({ count, children }: { count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropIds.bench });

  return (
    <div ref={setNodeRef} className={isOver ? 'bench-area bench-over' : 'bench-area'}>
      <h3>入れていない人（{count}人）</h3>
      <div className="bench">{children}</div>
    </div>
  );
}
