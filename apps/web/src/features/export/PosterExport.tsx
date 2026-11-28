import {
  buildPoster,
  hitRankingPeriods,
  HIT_METRICS,
  POSTER_METRIC_TITLES,
  POSTER_TARGET_LABELS,
  POSTER_TARGETS,
  type HitFilter,
  type HitMetric,
  type HitPeriod,
  type Poster,
  type PosterTarget,
} from '@kyudo/core';
import { useState } from 'react';
import { messageOf } from '../../lib/api.ts';
import { loadHitDays } from '../../lib/hitQueries.ts';
import { loadDirectory, loadSettings } from '../../lib/queries.ts';
import { saveFile } from '../../lib/saveFile.ts';
import { useRemote } from '../../lib/useRemote.ts';
import { Options } from '../admin/Options.tsx';
import { FilterSelect, HitSelect } from '../hits/HitSelect.tsx';
import { PosterPreview } from './PosterPreview.tsx';

const METRIC_LABELS = Object.fromEntries(
  HIT_METRICS.map((metric) => [metric, POSTER_METRIC_TITLES[metric]]),
) as Record<HitMetric, string>;

function Form({ periods }: { periods: HitPeriod[] }) {
  const [metric, setMetric] = useState<HitMetric>('rate');
  const [periodId, setPeriodId] = useState('this_month');
  const [target, setTarget] = useState<PosterTarget>('split');
  const [filter, setFilter] = useState<HitFilter>('all');
  const [preview, setPreview] = useState<Poster | null>(null);
  /** 作って、保存を待っている Excel のファイル */
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const period = periods.find((candidate) => candidate.id === periodId) ?? periods[0]!;

  /** 選んだ内容で紙を作り、`deliver` に渡す。人がいなければ知らせる */
  async function create(deliver: (poster: Poster) => Promise<void> | void) {
    setBusy(true);
    setError('');
    setFile(null);
    try {
      const [days, members] = await Promise.all([
        loadHitDays(period.period.from, period.period.to),
        loadDirectory(),
      ]);
      const poster = buildPoster({ days, members, period, metric, target, filter });
      if (poster.columns.every((column) => column.rows.length === 0)) {
        setError('順位の付く人がいません。');
        return;
      }
      await deliver(poster);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const createExcel = () =>
    create(async (poster) => {
      // 使うときだけ読み込む
      const { posterFile } = await import('./posterFile.ts');
      setFile(await posterFile(poster));
    });

  // 内容を変えたら、前に作ったファイルは出さない
  const choose =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setFile(null);
      setError('');
    };

  return (
    <div className="form">
      <label>
        内容
        <select
          value={metric}
          onChange={(event) => choose(setMetric)(event.target.value as HitMetric)}
        >
          <Options values={HIT_METRICS} labels={METRIC_LABELS} />
        </select>
      </label>
      <div className="date-range">
        <HitSelect
          label="期間"
          options={periods.map(({ id, label }) => ({ value: id, label }))}
          value={period.id}
          onChange={choose(setPeriodId)}
        />
        <HitSelect
          label="対象"
          options={POSTER_TARGETS.map((value) => ({ value, label: POSTER_TARGET_LABELS[value] }))}
          value={target}
          onChange={choose(setTarget)}
        />
      </div>
      <FilterSelect value={filter} onChange={choose(setFilter)} />
      <button type="button" disabled={busy} onClick={() => void create(setPreview)}>
        印刷用の画面を開く
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void createExcel()}
      >
        Excel のファイルを作る
      </button>
      <p className="form-error" role="alert">
        {error}
      </p>
      {/* 保存はタップの直後でないと許可されないので、作成とは別のボタンにする */}
      {file && (
        <button type="button" onClick={() => void saveFile(file)}>
          「{file.name}」を保存
        </button>
      )}
      {preview && <PosterPreview poster={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

const loadStartDate = async () => (await loadSettings()).hitStartDate ?? null;

/** 張り出す順位の紙を、印刷か Excel で出す */
export function PosterExport({ today }: { today: string }) {
  const { data, error } = useRemote(loadStartDate);
  // 読み込み中の null と、決まっていない null を分けるため、空の配列で表す
  const periods = data && data <= today ? hitRankingPeriods(data, today) : [];

  return (
    <>
      <h3>張り出し・印刷（的中の順位）</h3>
      <p className="form-error" role="alert">
        {error}
      </p>
      {periods.length > 0 ? (
        <Form periods={periods} />
      ) : (
        <p className="empty">的中の記録を始めると、順位を出せます。</p>
      )}
    </>
  );
}
