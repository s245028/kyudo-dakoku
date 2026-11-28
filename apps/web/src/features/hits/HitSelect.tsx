import { HIT_FILTER_LABELS, HIT_FILTERS, type HitFilter } from '@kyudo/core';
import { Options } from '../admin/Options.tsx';

/** 名前を上に付けた選択欄 */
export function HitSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSelect({
  value,
  onChange,
}: {
  value: HitFilter;
  onChange: (value: HitFilter) => void;
}) {
  return (
    <label>
      区分
      <select value={value} onChange={(event) => onChange(event.target.value as HitFilter)}>
        <Options values={HIT_FILTERS} labels={HIT_FILTER_LABELS} />
      </select>
    </label>
  );
}
