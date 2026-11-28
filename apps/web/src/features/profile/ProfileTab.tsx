import {
  canAdminister,
  canManagePenalties,
  GRADE_LABELS,
  ROLE_LABELS,
  roleLabels,
  STATUS_LABELS,
} from '@kyudo/core';
import type { Home, HomeData } from '../../lib/home.ts';
import { AdminLogin } from '../register/AdminLogin.tsx';
import { KomaForm } from './KomaForm.tsx';
import { ICON_BADGE_NOTE } from './iconBadgeNote.ts';
import { NotificationCard } from './NotificationCard.tsx';
import { SignupSteps } from './SignupSteps.tsx';
import { TransferCard } from './TransferCard.tsx';

export function ProfileTab({ home, onHome }: { home: HomeData; onHome: (home: Home) => void }) {
  const { member } = home;
  const rows = [
    ['名前', member.name],
    ['学生番号', member.studentNo],
    ['学年', GRADE_LABELS[member.grade]],
    ['役職', roleLabels(member).join('・') || ROLE_LABELS.member],
    ['状態', member.approved ? STATUS_LABELS[member.status] : '承認待ち'],
  ];

  return (
    <>
      {!member.approved && <SignupSteps komaSaved={home.koma !== null} />}
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
        分前までに「打刻」タブの「出欠の連絡」から送ってください。
      </p>
      {member.approved && (
        <NotificationCard
          description={[
            canAdminister(member)
              ? '出欠の連絡、コマ変更の申請、新しい部員の登録が届いたときと、自分の分が承認・却下されたときに知らせます。'
              : '出欠の連絡やコマ変更の申請が、承認・却下されたときに知らせます。',
            member.role === 'vice' ? '罰の割り当て待ちが増えたときにも知らせます。' : '',
            // 数字を出す相手は、対応を待つものがある役職
            canAdminister(member) || canManagePenalties(member) ? ICON_BADGE_NOTE : '',
          ].join('')}
        />
      )}
      <TransferCard />
      <AdminLogin />
    </>
  );
}
