import {
  GRADE_LABELS,
  GRADES,
  parseStudentNos,
  planGenerationChange,
  type Grade,
} from '@kyudo/core';
import { useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton.tsx';
import type { RosterEntry } from '../../lib/queries.ts';
import { Options } from './Options.tsx';
import type { RunAction } from '../../lib/useAction.ts';

type GenerationChangeFormProps = {
  members: RosterEntry[];
  today: string;
  sending: boolean;
  run: RunAction;
};

export function GenerationChangeForm({ members, today, sending, run }: GenerationChangeFormProps) {
  const [retiringGrade, setRetiringGrade] = useState<Grade>('B3');
  const [captainNos, setCaptainNos] = useState('');
  const [viceNos, setViceNos] = useState('');
  // 実行する前に、サーバーと同じ計算で結果を見せる
  const plan = planGenerationChange({
    members,
    retiringGrade,
    captainNos: parseStudentNos(captainNos),
    viceNos: parseStudentNos(viceNos),
    today,
  });
  const retiring = plan.ok
    ? members.filter((member) => plan.value.retiringIds.includes(member.id))
    : [];

  return (
    <div className="form">
      <label>
        引退する学年
        <select
          value={retiringGrade}
          onChange={(event) => setRetiringGrade(event.target.value as Grade)}
        >
          <Options values={GRADES} labels={GRADE_LABELS} />
        </select>
      </label>
      <label>
        新しい主将の学生番号（空なら変えない）
        <input value={captainNos} onChange={(event) => setCaptainNos(event.target.value)} />
      </label>
      <label>
        新しい副務の学生番号（複数はカンマ区切り。空なら変えない）
        <input value={viceNos} onChange={(event) => setViceNos(event.target.value)} />
      </label>
      <p className="sub">
        {plan.ok
          ? `${retiring.length}人（${retiring.map((member) => member.name).join('、')}）を今日付けで引退にします。残っている罰はそのままです。`
          : plan.message}
      </p>
      <ConfirmButton
        label="代替わりを実行する"
        disabled={sending || !plan.ok}
        onConfirm={() => void run('change-generation', { retiringGrade, captainNos, viceNos })}
      />
    </div>
  );
}
