/** 縦軸の目盛り。0から、切りのよい整数の幅（1・2・5の倍数）で最大4区切りにする */
export function axisScale(max: number): { top: number; ticks: number[] } {
  const wanted = Math.max(1, max) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, wanted)));
  const step = [1, 2, 5, 10].map((unit) => unit * magnitude).find((size) => size >= wanted)!;
  const count = Math.max(1, Math.ceil(max / step));
  return { top: step * count, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) };
}
