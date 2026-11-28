type HeaderProps = {
  title: string;
  subtitle: string;
  role?: string | undefined;
  state?: { label: string; active: boolean } | undefined;
  /** 役職のある人の、項目の一覧を開くボタン。`waiting` は対応を待っている数 */
  menu?: { waiting: number; open: boolean; onOpen: () => void } | undefined;
};

export function Header({ title, subtitle, role, state, menu }: HeaderProps) {
  return (
    <header className="app-header">
      {menu && (
        <button
          type="button"
          className="header-menu"
          aria-label={`役職の項目を開く${menu.waiting ? `（対応待ち${menu.waiting}）` : ''}`}
          aria-expanded={menu.open}
          onClick={menu.onOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {menu.waiting > 0 && <span className="header-badge">{menu.waiting}</span>}
        </button>
      )}
      <div className="app-heading">
        <h1 className="app-title">{title}</h1>
        <p className="app-subtitle">{subtitle}</p>
      </div>
      <div className="pills">
        {role && <span className="pill pill-role">{role}</span>}
        {state && <span className={state.active ? 'pill pill-active' : 'pill'}>{state.label}</span>}
      </div>
    </header>
  );
}
