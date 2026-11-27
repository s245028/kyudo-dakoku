/** 差の表し方。`+3`、`−2`、`±0` */
export function signed(value: number): string {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : `−${-value}`;
}
