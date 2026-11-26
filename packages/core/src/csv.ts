export type CsvValue = string | number | boolean | null | undefined;

/** 表計算ソフトが日本語を正しく読むための目印 */
const BYTE_ORDER_MARK = '\uFEFF';

function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // 利用者が入力した文字が、表計算ソフトで数式として実行されないようにする
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(','));
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
