import { lazy, Suspense } from 'react';
import type { Home } from '../../lib/home.ts';

// 管理画面は、開いたときにだけ読み込む
const AdminTab = lazy(async () => {
  const { AdminTab: component } = await import('./AdminTab.tsx');
  return { default: component };
});

export function LazyAdminTab(props: { today: string; onHome: (home: Home) => void }) {
  return (
    <Suspense fallback={<p className="empty">読み込み中…</p>}>
      <AdminTab {...props} />
    </Suspense>
  );
}
