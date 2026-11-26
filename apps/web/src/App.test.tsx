import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

describe('App', () => {
  it('日本時間の今日の日付を表示する', () => {
    const html = renderToStaticMarkup(<App now={new Date('2026-11-26T15:00:00Z')} />);

    expect(html).toContain('2026-11-27');
  });
});
