import {
  canAdminister,
  canManagePenalties,
  GRADE_LABELS,
  PUNCH_LABELS,
  ROLE_LABELS,
  roleLabels,
  STATUS_LABELS,
  toClockTime,
} from '@kyudo/core';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Home, HomeData, HomeView } from '../../lib/home.ts';
import { UpcomingDaysCard } from '../notice/UpcomingDaysCard.tsx';
import { AdminLogin } from '../register/AdminLogin.tsx';
import { TodayPunches } from '../scan/TodayPunches.tsx';
import { KomaForm } from './KomaForm.tsx';
import { ICON_BADGE_NOTE } from './iconBadgeNote.ts';
import { NotificationCard } from './NotificationCard.tsx';
import { SignupSteps } from './SignupSteps.tsx';
import { TransferCard } from './TransferCard.tsx';

/** マイページの項目。押すと、その内容の画面を開く */
export type ProfilePage = 'punches' | 'profile' | 'koma' | 'notification' | 'transfer';

const PAGE_LABELS: Record<ProfilePage, string> = {
  punches: '今日の入退室',
  profile: '登録情報',
  koma: '授業のコマ',
  notification: '通知',
  transfer: '引き継ぎ番号',
};

/** 承認前は打刻できないので、入退室と通知は出さない */
const UNAPPROVED_PAGES: ProfilePage[] = ['profile', 'koma', 'transfer'];
const APPROVED_PAGES: ProfilePage[] = ['punches', 'profile', 'koma', 'notification', 'transfer'];

type ProfileTabProps = {
  home: HomeData;
  view: HomeView;
  /** 最初に開いておく項目。登録した直後は、授業のコマ */
  initialPage: ProfilePage | null;
  onHome: (home: Home) => void;
};

/** 自分の画面。欠席・遅刻の連絡と、自分の記録・設定の項目 */
export function ProfileTab({ home, view, initialPage, onHome }: ProfileTabProps) {
  const [page, setPage] = useState(initialPage);
  const top = useRef<HTMLDivElement>(null);
  const { member } = home;

  // 項目を開いたり戻ったりしたら、上から見せる
  useLayoutEffect(() => {
    top.current?.closest('main')?.scrollTo(0, 0);
  }, [page]);

  const lastPunch = view.todayPunches.at(-1);
  /** 項目を開かなくても分かるように、右に出す今の状態 */
  const summaries: Partial<Record<ProfilePage, string>> = {
    punches: lastPunch
      ? `${PUNCH_LABELS[lastPunch.kind]} ${toClockTime(lastPunch.at)}`
      : '記録なし',
    koma: home.koma ? (home.settings.komaLocked ? '確定済み' : '保存済み') : '未入力',
  };
  const signup = !member.approved && <SignupSteps komaSaved={home.koma !== null} />;

  if (!page) {
    return (
      <div ref={top}>
        {signup}
        {member.approved && (
          <UpcomingDaysCard
            retired={view.retired}
            noticeDays={view.noticeDays}
            komaDays={view.komaDays}
            joinDays={view.joinDays}
            noticeLeadMinutes={home.settings.noticeLeadMinutes}
            onChanged={onHome}
          />
        )}
        <ul className="list menu-list">
          {(member.approved ? APPROVED_PAGES : UNAPPROVED_PAGES).map((id) => (
            <li key={id}>
              <button type="button" className="menu-item" onClick={() => setPage(id)}>
                {PAGE_LABELS[id]}
                {summaries[id] && <span className="menu-summary">{summaries[id]}</span>}
              </button>
            </li>
          ))}
        </ul>
        <AdminLogin />
      </div>
    );
  }

  return (
    <div ref={top} className="profile-page">
      <button type="button" className="link-button back-button" onClick={() => setPage(null)}>
        ‹ 自分に戻る
      </button>
      {page === 'punches' && <TodayPunches punches={view.todayPunches} />}
      {page === 'profile' && <Registration member={member} />}
      {page === 'koma' && (
        <>
          {signup}
          <h2>授業のコマ（今学期）</h2>
          <KomaForm saved={home.koma} locked={home.settings.komaLocked} onSaved={onHome} />
          <p className="hint">
            授業があるコマにチェックします。5コマがある日は後半、ない日は前半の集合です。
            {member.approved &&
              'その日だけの休講・補講は、「欠席・遅刻の連絡」の日から申請します。'}
          </p>
        </>
      )}
      {page === 'notification' && (
        <NotificationCard
          description={[
            canAdminister(member)
              ? '届いた連絡・申請・部員登録と、自分の分の承認・却下を知らせます。'
              : '連絡・申請の承認と却下を知らせます。',
            member.role === 'vice' ? '罰の割り当て待ちも知らせます。' : '',
            // 数字を出す相手は、対応を待つものがある役職
            canAdminister(member) || canManagePenalties(member) ? ICON_BADGE_NOTE : '',
          ].join('')}
        />
      )}
      {page === 'transfer' && <TransferCard />}
    </div>
  );
}

function Registration({ member }: { member: HomeData['member'] }) {
  const rows = [
    ['名前', member.name],
    ['学生番号', member.studentNo],
    ['学年', GRADE_LABELS[member.grade]],
    ['役職', roleLabels(member).join('・') || ROLE_LABELS.member],
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
    </>
  );
}
