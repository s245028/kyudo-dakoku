import { addDays } from '@kyudo/core';
import { useState } from 'react';
import { dateWithWeekday } from '../../../lib/format.ts';
import { DayEditor } from './DayEditor.tsx';

/** 自分の記録を、日を選んで入れる */
export function EntryView({
  memberId,
  startDate,
  today,
  changes,
}: {
  memberId: string;
  startDate: string;
  today: string;
  changes: number;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  // 日付を選んでいなければ、日が変わると今日になる
  const date = chosen ?? today;
  const move = (days: number) => {
    const next = addDays(date, days);
    setChosen(next === today ? null : next);
  };

  return (
    <>
      <div className="date-pager">
        <button
          type="button"
          aria-label="前の日"
          disabled={date <= startDate}
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <strong>
          {dateWithWeekday(date)}
          {date === today && ' 今日'}
        </strong>
        <button type="button" aria-label="次の日" disabled={date >= today} onClick={() => move(1)}>
          ›
        </button>
      </div>
      <DayEditor key={date} memberId={memberId} date={date} own changes={changes} />
    </>
  );
}
