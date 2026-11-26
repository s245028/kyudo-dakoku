import { toCsv } from '@kyudo/core';
import { useState } from 'react';
import { messageOf } from '../../lib/api.ts';
import { saveFile } from '../../lib/saveFile.ts';
import { DATASETS, type DatasetId } from './datasets.ts';

export function ExportSection({ today }: { today: string }) {
  /** 作成して、保存を待っているファイル */
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<DatasetId | null>(null);
  const [error, setError] = useState('');

  async function create(id: DatasetId) {
    setLoading(id);
    setFile(null);
    setError('');
    try {
      const { label, load } = DATASETS[id];
      const { header, rows } = await load(today);
      setFile(new File([toCsv(header, rows)], `${label}_${today}.csv`, { type: 'text/csv' }));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <h3>CSV の書き出し</h3>
      <p className="hint">部員の個人情報が含まれます。保存先と共有する相手に気をつけてください。</p>
      {(Object.keys(DATASETS) as DatasetId[]).map((id) => (
        <button
          key={id}
          type="button"
          className="secondary"
          disabled={loading !== null}
          onClick={() => void create(id)}
        >
          {loading === id ? '作成中…' : DATASETS[id].label}
        </button>
      ))}
      <p className="form-error" role="alert">
        {error}
      </p>
      {/* 保存はタップの直後でないと許可されないので、作成とは別のボタンにする */}
      {file && (
        <button type="button" onClick={() => void saveFile(file)}>
          「{file.name}」を保存
        </button>
      )}
    </>
  );
}
