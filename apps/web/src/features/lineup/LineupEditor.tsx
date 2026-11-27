import {
  arrangeLineup,
  GROUP_SIZES,
  groupSizeOf,
  isLineupStale,
  MAX_GROUP_SIZE,
  LINEUP_FORMAT_LABELS,
  LINEUP_FORMATS,
  lineupWarnings,
  MAX_GROUPS,
  toClockTime,
  type GroupSize,
  type Lineup,
  type LineupFormat,
  type Part,
  type Participant,
  type Person,
} from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { readLineupDraft, writeLineupDraft, type LineupDraft } from '../../lib/lineupDraft.ts';
import type { SavedLineup } from '../../lib/lineupQueries.ts';
import { useAction } from '../../lib/useAction.ts';
import { LineupCanvas } from './LineupCanvas.tsx';
import type { Tag } from './TagFace.tsx';
import { Options } from '../admin/Options.tsx';

/** 戻せる操作の数 */
const HISTORY_LIMIT = 30;

type LineupEditorProps = {
  date: string;
  part: Part;
  /** この区分の参加者 */
  participants: Participant[];
  /** 名簿。参加者でなくなった人の名前を出すのに使う */
  members: readonly Person[];
  saved: SavedLineup | null;
  defaultFormat: LineupFormat;
  /** 保存した内容を読み直す */
  onSaved: () => unknown;
};

/** 区分1つぶんの立ち順を作る。 */
export function LineupEditor(props: LineupEditorProps) {
  const { date, part, participants, members, saved, defaultFormat, onSaved } = props;
  /** 保存していない編集。端末に残すので、ほかの画面を見ても消えない */
  const [edited, setEdited] = useState<LineupDraft | null>(() => readLineupDraft(date, part));
  const draft: Lineup | null = edited?.lineup ?? saved;
  const dirty = edited !== null;
  const savedAt = saved?.updatedAt ?? null;
  /** 編集を始めたあとに、ほかの人が保存か削除をした */
  const stale = edited !== null && isLineupStale(edited.base, savedAt);
  const [format, setFormat] = useState<LineupFormat>(draft?.format ?? defaultFormat);
  const [groupSize, setGroupSize] = useState<GroupSize>(
    () => edited?.groupSize ?? groupSizeOf(draft?.groups ?? []),
  );
  /** 9人の立ちがある板は、選んでいる人数にかかわらず9人まで直せる */
  const editingSize =
    draft && groupSizeOf(draft.groups) === MAX_GROUP_SIZE ? MAX_GROUP_SIZE : groupSize;

  function chooseGroupSize(size: GroupSize) {
    setGroupSize(size);
    if (edited) keep({ ...edited, groupSize: size });
  }
  const action = useAction();

  const keep = (next: LineupDraft | null) => {
    setEdited(next);
    writeLineupDraft(date, part, next);
  };
  const edit = (next: Lineup) =>
    keep({
      lineup: next,
      base: edited ? edited.base : savedAt,
      groupSize,
      history: [...(edited?.history ?? []), edited?.lineup ?? null].slice(-HISTORY_LIMIT),
    });
  /** 直前の操作の前に戻す。最初の操作より前は、保存した内容になる */
  function undo() {
    if (!edited) return;
    const history = edited.history ?? [];
    const previous = history.at(-1);
    keep(previous ? { ...edited, lineup: previous, history: history.slice(0, -1) } : null);
  }
  const arrange = () =>
    edit({
      format,
      groups: arrangeLineup(format, participants, groupSize),
      published: draft?.published ?? false,
    });

  const tagOf = (id: string): Tag => {
    const entry = participants.find((candidate) => candidate.person.id === id);
    const name = entry?.person.name ?? members.find((member) => member.id === id)?.name ?? '不明';
    const mark =
      !entry || entry.status === 'absent' ? '欠' : entry.status === 'late' ? '遅' : undefined;
    return { id, name, ...(mark && { mark }) };
  };

  const placed = new Set(draft?.groups.flat());
  const bench = participants
    .filter((entry) => entry.status !== 'absent' && !placed.has(entry.person.id))
    .map((entry) => tagOf(entry.person.id));
  const warnings = draft
    ? lineupWarnings(
        draft.format,
        draft.groups,
        (id) => members.find((member) => member.id === id)?.role,
      )
    : [];

  async function save() {
    if (!edited) return;
    const { format: kind, groups, published } = edited.lineup;
    const ok = await action.run(
      'admin-save-lineup',
      {
        date,
        part,
        format: kind,
        groups: kind === 'groups' ? groups.filter((group) => group.length > 0) : groups,
        published,
        baseUpdatedAt: edited.base,
      },
      async () => {
        await onSaved();
        keep(null);
      },
    );
    // ほかの人が先に保存した場合に、その内容を出せるように読み直す
    if (!ok) await onSaved();
  }

  async function remove() {
    const ok = await action.run(
      'admin-delete-lineup',
      { date, part, baseUpdatedAt: savedAt },
      async () => {
        await onSaved();
        keep(null);
      },
    );
    if (!ok) await onSaved();
  }

  return (
    <>
      <div className="lineup-tools">
        <label>
          並べ方
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as LineupFormat)}
          >
            <Options values={LINEUP_FORMATS} labels={LINEUP_FORMAT_LABELS} />
          </select>
        </label>
        {(format === 'groups' || draft?.format === 'groups') && (
          <label>
            1立ちの人数
            <select
              value={groupSize}
              onChange={(event) => chooseGroupSize(Number(event.target.value) as GroupSize)}
            >
              {GROUP_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}人まで
                </option>
              ))}
            </select>
          </label>
        )}
        {draft ? (
          <ConfirmButton label="自動で並べ直す" className="small secondary" onConfirm={arrange} />
        ) : (
          <button type="button" className="small" onClick={arrange}>
            自動で並べる
          </button>
        )}
      </div>

      {saved && (
        <p className="sub lineup-saved">
          最後の保存：{saved.updatedBy ?? '管理者'} {toClockTime(new Date(saved.updatedAt))}（
          {saved.published ? '公開中' : '非公開'}）
        </p>
      )}

      {draft && (
        <>
          <p className="hint">
            右端が先頭です。札は長押ししてドラッグします。札の中央に置くと入れ替わり、札と札の境目に置くと間に入ります。押してから、入れ替える札か「＋」を押しても直せます。
          </p>
          <LineupCanvas
            draft={draft}
            groupSize={editingSize}
            bench={bench}
            tagOf={tagOf}
            onChange={(groups) => edit({ ...draft, groups })}
          >
            {draft.format === 'groups' && draft.groups.length < MAX_GROUPS && (
              <button
                type="button"
                className="small secondary lineup-add"
                onClick={() => edit({ ...draft, groups: [...draft.groups, []] })}
              >
                立ちを増やす
              </button>
            )}
            {warnings.map((warning) => (
              <p className="form-error" key={warning}>
                {warning}
              </p>
            ))}
          </LineupCanvas>
          {dirty && (
            <ConfirmButton
              label="保存していない変更を捨てる"
              className="small secondary lineup-discard"
              onConfirm={() => keep(null)}
            />
          )}
          {saved && !dirty && (
            <ConfirmButton
              label="この立ち順を削除する"
              className="small secondary lineup-discard"
              disabled={action.sending}
              onConfirm={() => void remove()}
            />
          )}
        </>
      )}
      <div className="lineup-bar" hidden={!draft && !stale && !action.error}>
        {stale && edited && (
          <div className="notice lineup-conflict" role="alert">
            <p>ほかの人が{saved ? '保存' : '削除'}しました。このまま保存すると上書きになります。</p>
            <div className="notice-actions">
              <button type="button" className="small" onClick={() => keep(null)}>
                相手の内容を表示する
              </button>
              <button
                type="button"
                className="small secondary"
                onClick={() => keep({ ...edited, base: savedAt })}
              >
                自分の内容を残す
              </button>
            </div>
          </div>
        )}
        <p className="form-error" role="alert">
          {!stale && action.error}
        </p>
        {draft && (
          <div className="lineup-bar-row">
            <label className="lineup-publish">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(event) => edit({ ...draft, published: event.target.checked })}
              />
              公開
            </label>
            <span className={dirty ? 'lineup-status lineup-status-dirty' : 'lineup-status'}>
              {dirty ? '未保存' : '保存済み'}
            </span>
            <button
              type="button"
              className="small secondary"
              disabled={action.sending || !dirty}
              onClick={undo}
            >
              戻す
            </button>
            <button
              type="button"
              className="small"
              disabled={action.sending || !dirty || stale}
              onClick={() => void save()}
            >
              保存する
            </button>
          </div>
        )}
      </div>
    </>
  );
}
