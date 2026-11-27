export type Tag = {
  id: string;
  name: string;
  /** 札の下に出す印（遅・欠など） */
  mark?: string;
};

/** 木札に書く内容 */
export function TagFace({ tag }: { tag: Tag }) {
  return (
    <>
      <span className="tag-name">{tag.name}</span>
      {tag.mark && <span className="tag-mark">{tag.mark}</span>}
    </>
  );
}
