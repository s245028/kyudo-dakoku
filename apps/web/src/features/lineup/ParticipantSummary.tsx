import { GENDER_LABELS, GENDERS, GRADE_LABELS, GRADES, type Participant } from '@kyudo/core';

const names = (participants: Participant[]) =>
  participants.map(({ person, pending }) => `${person.name}${pending ? '（承認待ち）' : ''}`);

/** その区分の参加者の人数と、遅刻・欠席の人 */
export function ParticipantSummary({ participants }: { participants: Participant[] }) {
  const joining = participants.filter((entry) => entry.status !== 'absent');
  const late = participants.filter((entry) => entry.status === 'late');
  const absent = participants.filter((entry) => entry.status === 'absent');
  const inRoom = participants.filter((entry) => entry.inRoom);
  const breakdown = <T extends string>(
    values: readonly T[],
    labels: Record<T, string>,
    of: (entry: Participant) => T,
  ) =>
    values
      .map((value) => [labels[value], joining.filter((entry) => of(entry) === value).length])
      .filter(([, count]) => count)
      .map(([label, count]) => `${label} ${count}`)
      .join('・');

  return (
    <div className="card participants">
      <p className="participants-total">
        参加 <strong>{joining.length}</strong>人
        <span className="sub">
          （うち遅刻 {late.length}）・欠席 {absent.length}人・在室 {inRoom.length}人
        </span>
      </p>
      <p className="sub">
        {breakdown(GENDERS, GENDER_LABELS, (entry) => entry.person.gender)}
        {' ／ '}
        {breakdown(GRADES, GRADE_LABELS, (entry) => entry.person.grade)}
      </p>
      <dl className="participants-names">
        {late.length > 0 && (
          <div>
            <dt>遅刻</dt>
            <dd>{names(late).join('、')}</dd>
          </div>
        )}
        {absent.length > 0 && (
          <div>
            <dt>欠席</dt>
            <dd>{names(absent).join('、')}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
