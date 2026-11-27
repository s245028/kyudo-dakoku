import { isEnrolled, STATUS_LABELS } from '@kyudo/core';
import { useState, type ReactNode } from 'react';
import { Header } from './components/Header.tsx';
import { AdminScreen } from './AdminScreen.tsx';
import { RegisterScreen } from './features/register/RegisterScreen.tsx';
import { logOutAdmin } from './lib/adminAuth.ts';
import { isAdminMode } from './lib/adminMode.ts';
import { isAdminHome, type Home } from './lib/home.ts';
import { useHome } from './lib/useHome.ts';
import { useNow } from './lib/useNow.ts';
import { MainScreen } from './MainScreen.tsx';

export function App() {
  const { home, error, apply, refresh } = useHome();
  const now = useNow();
  /** 登録した直後は、コマ表の入力を開く */
  const [justRegistered, setJustRegistered] = useState(false);

  function registered(next: Home) {
    setJustRegistered(true);
    apply(next);
  }

  const adminMode = isAdminMode();

  if (!home) {
    return (
      <Blocker subtitle="">
        <p>{error ?? '読み込み中…'}</p>
        {error && (
          <button type="button" onClick={() => void refresh()}>
            もう一度読み込む
          </button>
        )}
        {error && adminMode && <LogOutButton />}
      </Blocker>
    );
  }
  if (isAdminHome(home)) return <AdminScreen home={home} now={now} onHome={apply} />;
  if (adminMode) {
    return (
      <Blocker subtitle="">
        <p>このアカウントは管理者として登録されていません。</p>
        <LogOutButton />
      </Blocker>
    );
  }
  if (!home.member) {
    return (
      <>
        <Header
          title="道場打刻"
          subtitle="はじめに部員登録をしてください"
          state={{ label: '未登録', active: false }}
        />
        <main className="app-main">
          <RegisterScreen onRegistered={registered} onTransferred={apply} />
        </main>
      </>
    );
  }
  if (!isEnrolled(home.member.status)) {
    return (
      <Blocker subtitle={`${home.member.name} さん`}>
        <p>{STATUS_LABELS[home.member.status]}のため打刻できません。主将に確認してください。</p>
        <button type="button" onClick={() => void refresh()}>
          もう一度読み込む
        </button>
      </Blocker>
    );
  }
  return (
    <MainScreen
      home={home}
      now={now}
      initialTab={justRegistered ? 'me' : 'scan'}
      error={error}
      onHome={apply}
      onRefresh={() => void refresh()}
    />
  );
}

function LogOutButton() {
  return (
    <button type="button" className="secondary" onClick={() => void logOutAdmin()}>
      管理者をログアウトする
    </button>
  );
}

function Blocker({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <>
      <Header title="道場打刻" subtitle={subtitle} />
      <main className="app-main blocker">{children}</main>
    </>
  );
}
