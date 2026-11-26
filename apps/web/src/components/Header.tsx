type HeaderProps = {
  title: string;
  subtitle: string;
  role?: string | undefined;
  state?: { label: string; active: boolean } | undefined;
};

export function Header({ title, subtitle, role, state }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
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
