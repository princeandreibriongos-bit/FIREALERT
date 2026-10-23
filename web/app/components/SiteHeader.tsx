import ThemeToggle from "./ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="brand">
          <span className="brand__mark">FireAlert</span>
          <span className="brand__tag">Field telemetry</span>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
