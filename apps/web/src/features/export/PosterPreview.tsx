import { formatHitRate, type Poster, type PosterColumn } from '@kyudo/core';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** 大きく出す順位 */
const HIGHLIGHTED_RANKS = 3;
/** 名前がこの長さを超えると字を小さくし、さらに超えると欄を上下に並べる */
const COMPACT_NAME = 11;
const STACKED_NAME = 15;

function layoutOf(longestName: number): string {
  if (longestName > STACKED_NAME) return 'poster-columns poster-stacked';
  return longestName > COMPACT_NAME ? 'poster-columns poster-compact' : 'poster-columns';
}

function Column({ column, metric }: { column: PosterColumn; metric: Poster['metric'] }) {
  const strong = (key: Poster['metric']) => (key === metric ? 'poster-metric' : undefined);

  return (
    <section>
      {column.heading && <h2>{column.heading}</h2>}
      <table>
        <thead>
          <tr>
            <th scope="col">順位</th>
            <th scope="col">氏名</th>
            <th scope="col">射数</th>
            <th scope="col">的中</th>
            <th scope="col">的中率</th>
          </tr>
        </thead>
        <tbody>
          {column.rows.map((row) => (
            <tr key={row.name} className={row.rank <= HIGHLIGHTED_RANKS ? 'poster-top' : undefined}>
              <td>{row.rank}</td>
              <td>{row.name}</td>
              <td className={strong('shots')}>{row.shots}</td>
              <td className={strong('hits')}>{row.hits}</td>
              <td className={strong('rate')}>{formatHitRate(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 印刷する紙の画面。印刷すると、紙の部分だけが出る */
export function PosterPreview({ poster, onClose }: { poster: Poster; onClose: () => void }) {
  useEffect(() => {
    const closeByKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeByKey);
    return () => window.removeEventListener('keydown', closeByKey);
  }, [onClose]);

  return createPortal(
    <div className="poster-layer" role="dialog" aria-modal="true" aria-label="印刷用の画面">
      <div className="poster-toolbar">
        <button type="button" className="small secondary" onClick={onClose}>
          閉じる
        </button>
        <button type="button" className="small" onClick={() => window.print()}>
          印刷する
        </button>
      </div>
      <p className="poster-hint">
        「印刷する」で何も出ないときは、Safari などのブラウザで開き直すか、Excel
        のファイルを使ってください。
      </p>
      <article className="poster-sheet">
        <h1>{poster.title}</h1>
        <p className="poster-subtitle">{poster.subtitle}</p>
        <div className={layoutOf(poster.longestName)}>
          {poster.columns.map((column, index) => (
            // 欄は左右の位置で区別する
            <Column key={index} column={column} metric={poster.metric} />
          ))}
        </div>
        <p className="poster-note">{poster.note}</p>
      </article>
    </div>,
    document.body,
  );
}
