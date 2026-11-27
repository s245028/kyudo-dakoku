import {
  arrangeLineup,
  LINEUP_FORMAT_LABELS,
  LINEUP_FORMATS,
  lineupWarnings,
  MAX_GROUPS,
  moveInLineup,
  swapInLineup,
  type Lineup,
  type LineupFormat,
  type LineupGroups,
  type Part,
  type Participant,
  type Person,
} from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { useAction } from '../../lib/useAction.ts';
import { LineupBoard, type Tag } from './LineupBoard.tsx';
import { Options } from '../admin/Options.tsx';

type LineupEditorProps = {
  date: string;
  part: Part;
  /** この区分の参加者 */
  participants: Participant[];
  /** 名簿。参加者でなくなった人の名前を出すのに使う */
  members: readonly Person[];
  saved: Lineup | null;
  defaultFormat: LineupFormat;
  onSaved: () => unknown;
};

/** 区分1つぶんの立ち順を作る。札を押してから、入れ替える札か移す先を押す。 */
export function LineupEditor(props: LineupEditorProps) {
  const { date, part, participants, members, saved, defaultFormat, onSaved } = props;
  /** 保存していない編集。なければ、保存した内容を出す */
  const [edited, setEdited] = useState<Lineup | null>(null);
  const draft = edited ?? saved;
  const dirty = edited !== null;
  const [format, setFormat] = useState<LineupFormat>(saved?.format ?? defaultFormat);
  const [selected, setSelected] = useState<string | null>(null);
  const action = useAction();

  const edit = (next: Lineup) => {
    setEdited(next);
    setSelected(null);
  };
  const arrange = () =>
    edit({
      format,
      groups: arrangeLineup(format, participants),
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

  function pick(id: string) {
    if (!draft || selected === null) return setSelected(id);
    if (selected === id) return setSelected(null);
    // どちらも板にない場合は、選び直すだけ
    if (!placed.has(selected) && !placed.has(id)) return setSelected(id);
    edit({ ...draft, groups: swapInLineup(draft.groups, selected, id) });
  }

  const move = (column: number | null) => {
    if (!draft || selected === null) return;
    edit({ ...draft, groups: moveInLineup(draft.format, draft.groups, selected, column) });
  };

  async function save() {
    if (!draft) return;
    const groups: LineupGroups =
      draft.format === 'groups' ? draft.groups.filter((group) => group.length > 0) : draft.groups;
    await action.run('admin-save-lineup', { date, part, ...draft, groups }, async () => {
      await onSaved();
      setEdited(null);
    });
  }

  const remove = () =>
    action.run('admin-delete-lineup', { date, part }, async () => {
      await onSaved();
      setEdited(null);
      setSelected(null);
    });

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
        {draft ? (
          <ConfirmButton label="自動で並べ直す" className="small secondary" onConfirm={arrange} />
        ) : (
          <button type="button" className="small" onClick={arrange}>
            自動で並べる
          </button>
        )}
      </div>

      {draft && (
        <>
          <p className="hint">右端が先頭です。札を押してから、入れ替える札か「＋」を押します。</p>
          <LineupBoard
            format={draft.format}
            columns={draft.groups.map((group) => group.map(tagOf))}
            highlighted={selected}
            onTag={pick}
            {...(selected !== null && { onColumn: move })}
          />
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

          <h3>入れていない人（{bench.length}人）</h3>
          <div className="bench">
            {bench.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={tag.id === selected ? 'tag tag-highlighted' : 'tag'}
                aria-pressed={tag.id === selected}
                onClick={() => pick(tag.id)}
              >
                <span className="tag-name">{tag.name}</span>
                {tag.mark && <span className="tag-mark">{tag.mark}</span>}
              </button>
            ))}
            {selected !== null && placed.has(selected) && (
              <button type="button" className="small secondary" onClick={() => move(null)}>
                選んだ札を外す
              </button>
            )}
          </div>

          <div className="form lineup-save">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(event) => edit({ ...draft, published: event.target.checked })}
              />
              部員に公開する
            </label>
            <p className="sub" role="status">
              {dirty
                ? '保存していません'
                : draft.published
                  ? '保存済み（公開中）'
                  : '保存済み（非公開）'}
            </p>
            <button type="button" disabled={action.sending || !dirty} onClick={() => void save()}>
              保存する
            </button>
            {saved && (
              <ConfirmButton
                label="この立ち順を削除する"
                className="secondary"
                disabled={action.sending}
                onConfirm={() => void remove()}
              />
            )}
          </div>
        </>
      )}
      <p className="form-error" role="alert">
        {action.error}
      </p>
    </>
  );
}
