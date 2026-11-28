import { GRADE_LABELS, matchesMember, type Grade } from '@kyudo/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type PickerMember = { id: string; name: string; grade: Grade; studentNo?: string };

/** 名前の一部を入れると候補が出る、部員の選択欄。フォームには選んだ人の id を送る */
export function MemberPicker({
  label = '部員',
  members,
  onChoose,
}: {
  label?: string;
  members: readonly PickerMember[];
  /** 選んだ人が変わったとき。入力し直すと null */
  onChoose?: (member: PickerMember | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<PickerMember | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // 選んだあとにもう一度開いたら、全員を出す
  const matches = open
    ? members.filter((member) => matchesMember(member, chosen ? '' : query))
    : [];

  // 候補から選ぶまで、送れないようにする
  useEffect(() => {
    input.current?.setCustomValidity(chosen ? '' : '候補から部員を選んでください。');
  }, [chosen]);

  // フォームを空に戻したら、選択も外す
  useEffect(() => {
    const form = input.current?.form;
    const clear = () => {
      setQuery('');
      setChosen(null);
      onChoose?.(null);
    };
    form?.addEventListener('reset', clear);
    return () => form?.removeEventListener('reset', clear);
  }, [onChoose]);

  function choose(member: PickerMember | null) {
    setChosen(member);
    onChoose?.(member);
    if (!member) return;
    setQuery(member.name);
    setOpen(false);
  }

  function pickByKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') setOpen(false);
    // 漢字の変換を決める Enter では選ばない
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (!open || !matches[0]) return;
    event.preventDefault();
    choose(matches[0]);
  }

  return (
    <div className="member-picker">
      <label>
        {label}
        <input
          ref={input}
          value={query}
          placeholder="名前を入れて、候補から選ぶ"
          autoComplete="off"
          enterKeyHint="search"
          aria-expanded={open}
          onChange={(event) => {
            setQuery(event.target.value);
            choose(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={pickByKey}
        />
      </label>
      <input type="hidden" name="memberId" value={chosen?.id ?? ''} />
      {open && (
        <ul className="member-options" aria-label="部員の候補">
          {matches.length === 0 && <li className="empty">当てはまる部員はいません</li>}
          {matches.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                // 入力欄から離れて、候補が閉じないようにする
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(member)}
              >
                <span>{member.name}</span>
                <small>
                  {GRADE_LABELS[member.grade]}
                  {member.studentNo && `・${member.studentNo}`}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
