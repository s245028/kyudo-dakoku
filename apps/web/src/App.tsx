import { toPracticeDate } from '@kyudo/core';

type AppProps = {
  now: Date;
};

export function App({ now }: AppProps) {
  const today = toPracticeDate(now);

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">道場打刻</h1>
        <time className="app-date" dateTime={today}>
          {today}
        </time>
      </header>
      <main className="app-main">
        <p className="notice">新しいアプリを準備中です。打刻は今までのアプリを使ってください。</p>
      </main>
    </>
  );
}
