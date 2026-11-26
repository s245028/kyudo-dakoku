import { GRADE_LABELS, ROLE_LABELS, STATUS_LABELS } from '@kyudo/core';
import type { Home, HomeData } from '../../lib/home.ts';
import { KomaForm } from './KomaForm.tsx';

export function ProfileTab({ home, onHome }: { home: HomeData; onHome: (home: Home) => void }) {
  const { member } = home;
  const rows = [
    ['名前', member.name],
    ['学生番号', member.studentNo],
    ['学年', GRADE_LABELS[member.grade]],
    ['役職', ROLE_LABELS[member.role]],
    ['状態', member.approved ? STATUS_LABELS[member.status] : '承認待ち'],
  ];

  return (
    <>
      <h2>登録情報</h2>
      <dl className="card profile">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>授業のコマ（今学期）</h3>
      <KomaForm saved={home.koma} locked={home.settings.komaLocked} onSaved={onHome} />
      <p className="hint">
        授業がある曜日・コマにチェックしてください。5コマがある日は後半、4コマだけの日と、どちらもない日は前半の集合時刻で遅刻を判定します。
        <br />
        休講・補講などその日だけの変更や、遅刻・欠席は、集合時間の{home.settings.noticeLeadMinutes}
        分前までに主将へ連絡してください。
      </p>
    </>
  );
}
