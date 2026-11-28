/** 連絡と登録の締め切り。文章にせず、項目と期限を並べる */
export function DeadlineRules({
  retired,
  noticeLeadMinutes,
}: {
  retired: boolean;
  noticeLeadMinutes: number;
}) {
  const limit = `集合の${noticeLeadMinutes}分前まで`;
  const rules = retired
    ? [
        ['参加の登録', '集合時刻まで'],
        ['参加の取り消し', limit],
        ['欠席・遅刻', `${limit}（過ぎると連絡遅れ）`],
      ]
    : [
        ['欠席・遅刻', `${limit}（過ぎると連絡遅れ）`],
        ['コマ変更', `${limit}（過ぎると不可）`],
      ];

  return (
    <dl className="deadline-rules">
      {rules.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
