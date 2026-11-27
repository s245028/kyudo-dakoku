import { describe, expect, it } from 'vitest';
import { axisScale } from './scale.ts';

describe('axisScale', () => {
  it('小さな値は1ずつ', () => {
    expect(axisScale(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(axisScale(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] });
  });

  it('大きな値は切りのよい幅にして、4区切り以内にする', () => {
    expect(axisScale(9)).toEqual({ top: 10, ticks: [0, 5, 10] });
    expect(axisScale(23).ticks).toEqual([0, 10, 20, 30]);
    expect(axisScale(180).ticks).toEqual([0, 50, 100, 150, 200]);
  });
});
