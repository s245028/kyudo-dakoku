import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import { isConfigured } from './lib/supabase.ts';
import './styles/base.css';
import './styles/forms.css';
import './styles/layout.css';
import './styles/scan.css';
import './styles/notice.css';
import './styles/penalties.css';
import './styles/admin.css';

// アプリ本体を端末に保存して、2回目から速く開く
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root がありません');
}

createRoot(container).render(
  <StrictMode>
    {isConfigured ? <App /> : <p className="notice">管理者の方へ：接続先が設定されていません。</p>}
  </StrictMode>,
);
