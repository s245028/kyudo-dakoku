import type { PenaltyType } from '@kyudo/core';
import type { FormEvent } from 'react';
import type { RunAction } from '../../lib/useAction.ts';

type PenaltyTypesFormProps = { types: PenaltyType[]; sending: boolean; run: RunAction };

export function PenaltyTypesForm({ types, sending, run }: PenaltyTypesFormProps) {
  async function save(event: FormEvent<HTMLFormElement>, reason?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    const type = {
      ...input,
      reason: reason ?? input['reason'],
      baseCount: Number(input['baseCount']),
    };
    if ((await run('admin-save-penalty-type', { type })) && !reason) form.reset();
  }

  return (
    <>
      <ul className="list">
        {types.map((type) => (
          <li key={type.reason}>
            <form className="list-row" onSubmit={(event) => void save(event, type.reason)}>
              <span>
                <strong>{type.reason}</strong>
                <small className="sub">
                  {type.assignedBy === 'auto' ? '自動' : '副務'}・{type.description}
                </small>
              </span>
              <span className="row-actions">
                <input
                  className="count-input"
                  type="number"
                  name="baseCount"
                  aria-label={`${type.reason}の基本の数`}
                  defaultValue={type.baseCount}
                  min={1}
                  max={20}
                  required
                />
                <button type="submit" className="small secondary" disabled={sending}>
                  保存
                </button>
              </span>
            </form>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={(event) => void save(event)}>
        <label>
          追加する理由
          <input name="reason" maxLength={30} required />
        </label>
        <label>
          基本の数
          <input type="number" name="baseCount" defaultValue={1} min={1} max={20} required />
        </label>
        <label>
          説明
          <input name="description" maxLength={200} />
        </label>
        <button type="submit" disabled={sending}>
          理由を追加
        </button>
      </form>
    </>
  );
}
