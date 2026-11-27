/** 横に並んだ選択肢から1つ選ぶ */
export function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** 読み上げ用の、選ぶものの名前 */
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="choice-row" role="group" aria-label={label}>
      {(Object.keys(options) as T[]).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {options[option]}
        </button>
      ))}
    </div>
  );
}
