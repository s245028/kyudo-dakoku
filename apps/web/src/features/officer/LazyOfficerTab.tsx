import { lazy, Suspense } from 'react';
import type { OfficerTabProps } from './OfficerTab.tsx';

// 役職の画面は、開いたときにだけ読み込む
const OfficerTab = lazy(async () => {
  const { OfficerTab: component } = await import('./OfficerTab.tsx');
  return { default: component };
});

export function LazyOfficerTab(props: OfficerTabProps) {
  return (
    <Suspense fallback={<p className="empty">読み込み中…</p>}>
      <OfficerTab {...props} />
    </Suspense>
  );
}
