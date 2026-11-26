import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.ts';

describe('toCsv', () => {
  it('見出しと行を CRLF で区切り、先頭に目印をつける', () => {
    expect(toCsv(['名前', '数'], [['太郎', 1]])).toBe('﻿名前,数\r\n太郎,1\r\n');
  });

  it('区切り・引用符・改行を含む値は引用符で囲む', () => {
    expect(toCsv(['a'], [['x,"y"\nz']])).toContain('"x,""y""\nz"');
  });

  it.each(['=1+1', '+1', '-1', '@a'])('数式に見える文字列 %s は文字のままにする', (value) => {
    expect(toCsv(['a'], [[value]])).toContain(`'${value}`);
  });

  it('数値と空の値はそのまま', () => {
    expect(toCsv(['a', 'b', 'c'], [[-1, null, false]])).toContain('-1,,false');
  });
});
