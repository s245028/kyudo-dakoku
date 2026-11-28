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
import type { RunAction } from '../../lib/useAction.ts';

type RulesFormProps = { rules: StoredRule[]; sending: boolean; run: RunAction };

/** 区分と時刻の入力欄 */
function TimeFields({ rule }: { rule?: PracticeRule }) {
  return (
    <>
      <label>
        区分
        <select name="part" defaultValue={rule?.part ?? 'whole'}>
          <Options values={PARTS} labels={PART_LABELS} />
        </select>
      </label>
      <label>
        集合時刻（遅刻の基準）
        <input type="time" name="deadline" defaultValue={rule?.deadline} required />
      </label>
      <label>
        練習開始
        <input type="time" name="startTime" defaultValue={rule?.startTime} required />
      </label>
      <label>
        練習終了（これより後の入室は欠席）
        <input type="time" name="endTime" defaultValue={rule?.endTime ?? ''} />
      </label>
    </>
  );
}

export function RulesForm({ rules, sending, run }: RulesFormProps) {
  /** 直している行の id */
  const [editing, setEditing] = useState<string | null>(null);

  /** `rule` があれば、その曜日と条件のルールを直す。なければ入力欄の曜日と条件で足す */
  async function save(event: FormEvent<HTMLFormElement>, rule?: PracticeRule) {
    event.preventDefault();
    const form = event.currentTarget;
    const input: Record<string, unknown> = Object.fromEntries(new FormData(form));
    const ok = await run('admin-save-rule', {
      rule: {
        ...input,
        weekday: rule?.weekday ?? Number(input['weekday']),
        condition: rule?.condition ?? input['condition'],
      },
    });
    if (!ok) return;
    if (rule) setEditing(null);
    else form.reset();
  }

  return (
    <>
      <ul className="list">
        {rules.map((rule) => (
          <li key={rule.id} className="rule-item">
            <div className="list-row">
              <span>
                <strong>
                  {WEEKDAY_LABELS[rule.weekday]}・{RULE_CONDITION_LABELS[rule.condition]}
                </strong>
                <small className="sub">
                  {PART_LABELS[rule.part]}・{rule.deadline}集合・{rule.startTime}開始
                  {rule.endTime ? `・${rule.endTime}終了` : '・終了未設定'}
                </small>
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="small secondary"
                  aria-expanded={editing === rule.id}
                  onClick={() => setEditing(editing === rule.id ? null : rule.id)}
                >
                  {editing === rule.id ? '閉じる' : '変更'}
                </button>
                <ConfirmButton
                  label="削除"
                  className="small secondary"
                  disabled={sending}
                  onConfirm={() => void run('admin-delete-rule', { ruleId: rule.id })}
                />
              </span>
            </div>
            {editing === rule.id && (
              <form className="form rule-form" onSubmit={(event) => void save(event, rule)}>
                <TimeFields rule={rule} />
                <button type="submit" disabled={sending}>
                  この内容で保存
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <h3>ルールを追加</h3>
      <form className="form" onSubmit={(event) => void save(event)}>
        <p className="sub">曜日と条件が同じルールは、上書きします。</p>
        <label>
          曜日
          <select name="weekday" defaultValue={1}>
            {WEEKDAY_LABELS.map((label, weekday) => (
              <option key={label} value={weekday}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          条件
          <select name="condition" defaultValue="all">
            <Options values={RULE_CONDITIONS} labels={RULE_CONDITION_LABELS} />
          </select>
        </label>
        <TimeFields />
        <button type="submit" disabled={sending}>
          ルールを追加
        </button>
      </form>
    </>
  );
}
