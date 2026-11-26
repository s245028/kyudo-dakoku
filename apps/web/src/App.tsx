import { isEnrolled, STATUS_LABELS } from '@kyudo/core';
import { useState, type ReactNode } from 'react';
import { Header } from './components/Header.tsx';
import { RegisterScreen } from './features/register/RegisterScreen.tsx';
import type { Home } from './lib/home.ts';
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

  if (!home) {
    return (
      <Blocker subtitle="">
        <p>{error ?? '読み込み中…'}</p>
        {error && (
          <button type="button" onClick={() => void refresh()}>
            もう一度読み込む
          </button>
        )}
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
          <RegisterScreen onRegistered={registered} />
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

function Blocker({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <>
      <Header title="道場打刻" subtitle={subtitle} />
      <main className="app-main blocker">{children}</main>
    </>
  );
}
