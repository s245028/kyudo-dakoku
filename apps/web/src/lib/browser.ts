// 開いているブラウザの種類。登録は端末の中の保存場所ごとなので、場所が分かれる開き方を見分ける

/**
 * - `line`：LINE の中のブラウザ
 * - `in-app`：ほかのアプリの中のブラウザ
 * - `ios-browser`：iPhone のブラウザ（ホーム画面のアプリとは保存場所が別）
 * - `ok`：そのまま登録してよい
 */
export type BrowserKind = 'line' | 'in-app' | 'ios-browser' | 'ok';

export function browserKind(input: {
  userAgent: string;
  /** ホーム画面のアプリとして開いている */
  standalone: boolean;
  maxTouchPoints: number;
}): BrowserKind {
  const { userAgent, standalone, maxTouchPoints } = input;
  if (/\bLine\/\d/.test(userAgent)) return 'line';
  if (/FBAN|FBAV|Instagram/.test(userAgent)) return 'in-app';
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    // iPad は Mac と名乗る
    (userAgent.includes('Macintosh') && maxTouchPoints > 1);
  return ios && !standalone ? 'ios-browser' : 'ok';
}

export function currentBrowser(): BrowserKind {
  return browserKind({
    userAgent: navigator.userAgent,
    standalone: matchMedia('(display-mode: standalone)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/** LINE で開くと、いつものブラウザに切り替わる URL */
export function externalBrowserUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
}
