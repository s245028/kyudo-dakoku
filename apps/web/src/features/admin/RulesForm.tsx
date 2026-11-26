import {
  PART_LABELS,
  PARTS,
  RULE_CONDITION_LABELS,
  RULE_CONDITIONS,
  type PracticeRule,
} from '@kyudo/core';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import { WEEKDAY_LABELS } from '../../lib/format.ts';
import type { StoredRule } from '../../lib/queries.ts';
import { Options } from './Options.tsx';
import type { RunAction } from './types.ts';

type RulesFormProps = { rules: StoredRule[]; sending: boolean; run: RunAction };

export function RulesForm({ rules, sending, run }: RulesFormProps) {
  const [editing, setEditing] = useState<PracticeRule | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const ok = await run('admin-save-rule', {
      rule: { ...input, weekday: Number(input['weekday']) },
    });
    if (ok) setEditing(null);
  }

  return (
    <>
      <ul className="list">
        {rules.map((rule) => (
          <li className="list-row" key={rule.id}>
            <span>
              <strong>
                {WEEKDAY_LABELS[rule.weekday]}・{RULE_CONDITION_LABELS[rule.condition]}
              </strong>
              <small className="sub">
                {PART_LABELS[rule.part]}・{rule.deadline}集合・{rule.startTime}開始
              </small>
            </span>
            <span className="row-actions">
              <button type="button" className="small secondary" onClick={() => setEditing(rule)}>
                変更
              </button>
              <ConfirmButton
                label="削除"
                className="small secondary"
                disabled={sending}
                onConfirm={() => void run('admin-delete-rule', { ruleId: rule.id })}
              />
            </span>
          </li>
        ))}
      </ul>
      {/* 選んだルールに合わせて、入力欄を作り直す */}
      <form
        className="form"
        key={editing ? `${editing.weekday}-${editing.condition}` : 'new'}
        onSubmit={(event) => void save(event)}
      >
        <p className="sub">曜日と条件が同じルールは、上書きします。</p>
        <label>
          曜日
          <select name="weekday" defaultValue={editing?.weekday ?? 1}>
            {WEEKDAY_LABELS.map((label, weekday) => (
              <option key={label} value={weekday}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          条件
          <select name="condition" defaultValue={editing?.condition ?? 'all'}>
            <Options values={RULE_CONDITIONS} labels={RULE_CONDITION_LABELS} />
          </select>
        </label>
        <label>
          区分
          <select name="part" defaultValue={editing?.part ?? 'whole'}>
            <Options values={PARTS} labels={PART_LABELS} />
          </select>
        </label>
        <label>
          集合時刻（遅刻の基準）
          <input type="time" name="deadline" defaultValue={editing?.deadline} required />
        </label>
        <label>
          練習開始
          <input type="time" name="startTime" defaultValue={editing?.startTime} required />
        </label>
        <button type="submit" disabled={sending}>
          ルールを保存
        </button>
      </form>
    </>
  );
}
