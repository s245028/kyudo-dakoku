const PRACTICE_TIME_ZONE = 'Asia/Tokyo';

const practiceDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: PRACTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ある瞬間が属する練習日（日本時間の日付）を `YYYY-MM-DD` で返す。 */
export function toPracticeDate(instant: Date): string {
  const parts = practiceDateFormat.formatToParts(instant);
  const valueOf = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}
