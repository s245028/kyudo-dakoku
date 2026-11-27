// 指やマウスの位置から、札を落とす先と、札のどこに落とすかを決める
import type { CollisionDetection } from '@dnd-kit/core';
import type { LineupFormat } from '@kyudo/core';
import type { DropHint } from './DragTags.tsx';
import { dropIds, targetOfDrop } from './dropIds.ts';

/** 札の両端から、この割合の幅は「間に入れる」。中央は入れ替え */
const EDGE_RATIO = 0.3;
/** 札と札のすき間も、近い札として扱う幅（px） */
const GAP_PX = 3;

/**
 * 的割りは列を上から下へ、立ちは行を右から左へ引く順に並ぶ。
 * 順が早い側の端なら前、遅い側の端なら後ろに入れる。
 */
function placeOnTag(
  format: LineupFormat,
  rect: { left: number; top: number; width: number; height: number },
  point: { x: number; y: number },
): DropHint {
  const ratio =
    format === 'targets'
      ? (point.y - rect.top) / rect.height
      : 1 - (point.x - rect.left) / rect.width;
  if (ratio < EDGE_RATIO) return 'before';
  return ratio > 1 - EDGE_RATIO ? 'after' : 'on';
}

/** 指のある場所の札か「＋」。どちらもなければ、置き場の上かを調べる。 */
export function detectDrop(format: LineupFormat): CollisionDetection {
  return ({ droppableContainers, droppableRects, pointerCoordinates: point }) => {
    if (!point) return [];
    const hits = droppableContainers.flatMap((container) => {
      const rect = droppableRects.get(container.id);
      if (!rect) return [];
      const margin = container.id === dropIds.bench ? 0 : GAP_PX / 2;
      const inside =
        point.x >= rect.left - margin &&
        point.x <= rect.left + rect.width + margin &&
        point.y >= rect.top - margin &&
        point.y <= rect.top + rect.height + margin;
      if (!inside) return [];
      const isTag = targetOfDrop(String(container.id))?.type === 'tag';
      const place = isTag ? placeOnTag(format, rect, point) : 'on';
      return [{ id: container.id, data: { place } }];
    });
    // 置き場の中の札は、置き場より先に選ぶ
    return hits.sort((a, b) => Number(a.id === dropIds.bench) - Number(b.id === dropIds.bench));
  };
}
