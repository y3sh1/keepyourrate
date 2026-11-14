export function Brand() {
  return <a className="brand" href="/" aria-label="KeepYourRate home"><span className="brand-mark" aria-hidden="true">k<span>↗</span></span>KeepYourRate<span className="brand-dot">.</span></a>;
}

export function Header({ privateView = false }: { privateView?: boolean }) {
  return <header className="site-header"><Brand /><span className="header-note"><span className="status-dot" />{privateView ? 'Private workspace' : 'Clear scope. Fair work.'}</span></header>;
}

export function Footer() {
  return <footer className="site-footer"><span>Keep your scope clear. Keep your work worthwhile.</span><span>USD · No payments collected</span></footer>;
}
