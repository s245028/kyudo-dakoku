import { formatHitRate, shortDate, tallyOf, type HitDay, type HitFilter } from '@kyudo/core';

/** 日ごと・部員ごとの一覧。名前が列、日付が行 */
export function DailyMatrix({
  days,
  filter,
  members,
}: {
  days: readonly HitDay[];
  filter: HitFilter;
  /** 並べる順の部員 */
  members: readonly { id: string; name: string }[];
}) {
  const cells = new Map(days.map((day) => [`${day.memberId}/${day.date}`, tallyOf(day, filter)]));
  const dates = [
    ...new Set(days.filter((day) => tallyOf(day, filter).shots > 0).map((day) => day.date)),
  ].sort();

  return (
    <>
      <div className="figure-heading">
        <h3>{'表3　日ごと・部員ごとの的中'}</h3>
      </div>
      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th scope="col">日付</th>
              {members.map((member) => (
                <th key={member.id} scope="col">
                  <span>{member.name.replace(/\s+/g, '')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date}>
                <th scope="row">{shortDate(date)}</th>
                {members.map((member) => {
                  const tally = cells.get(`${member.id}/${date}`);
                  return (
                    <td key={member.id}>
                      {tally?.shots ? (
                        <>
                          {formatHitRate(tally)}
                          <small>
                            {tally.hits}/{tally.shots}
                          </small>
                        </>
                      ) : (
                        '―'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
