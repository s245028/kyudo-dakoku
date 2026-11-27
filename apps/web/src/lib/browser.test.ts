import { describe, expect, it } from 'vitest';
import { browserKind, externalBrowserUrl } from './browser.ts';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const kind = (userAgent: string, standalone = false, maxTouchPoints = 5) =>
  browserKind({ userAgent, standalone, maxTouchPoints });

describe('ブラウザの種類', () => {
  it('LINE の中は、iPhone も Android も見分ける', () => {
    expect(kind(`${IPHONE} Line/14.19.0`)).toBe('line');
    expect(kind(`${ANDROID} Line/14.19.1/IAB`)).toBe('line');
  });

  it('ほかのアプリの中のブラウザ', () => {
    expect(kind(`${IPHONE} Instagram 350.0`)).toBe('in-app');
    expect(kind(`${ANDROID} [FB_IAB/FB4A;FBAV/480.0]`)).toBe('in-app');
  });

  it('iPhone と iPad は、ホーム画面のアプリでなければ案内する', () => {
    expect(kind(IPHONE)).toBe('ios-browser');
    expect(kind(MAC)).toBe('ios-browser');
    expect(kind(IPHONE, true)).toBe('ok');
  });

  it('Android のブラウザとパソコンは、そのまま登録できる', () => {
    expect(kind(ANDROID)).toBe('ok');
    expect(kind(MAC, false, 0)).toBe('ok');
    expect(kind(`${ANDROID} Online/1.0`)).toBe('ok');
  });

  it('LINE で外のブラウザに切り替える URL', () => {
    expect(externalBrowserUrl('https://example.com/')).toBe(
      'https://example.com/?openExternalBrowser=1',
    );
    expect(externalBrowserUrl('https://example.com/?a=1&openExternalBrowser=1')).toBe(
      'https://example.com/?a=1&openExternalBrowser=1',
    );
  });
});
