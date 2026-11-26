/** 値と日本語の名前から、選択肢を作る。 */
export function Options<T extends string>({
  values,
  labels,
}: {
  values: readonly T[];
  labels: Record<T, string>;
}) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}
