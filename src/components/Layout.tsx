import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { MAIN_CONTENT_ID } from '../constants';
import { APP_NAME, NAV_ITEMS, titleForPath } from '../navigation';
import { ErrorBoundary } from './ErrorBoundary';
import { LegalFooter } from './LegalFooter';
import { ThemeSelect } from './ThemeSelect';
import { UserMenu } from './UserMenu';
import { VerifyEmailBanner } from './VerifyEmailBanner';

const SIDEBAR_ID = 'app-sidebar';

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const title = titleForPath(pathname);
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app">
      <a href={`#${MAIN_CONTENT_ID}`} className="skip-link" onClick={skipToContent}>
        Skip to main content
      </a>

      <aside id={SIDEBAR_ID} className="sidebar" data-open={menuOpen}>
        <div className="brand">{APP_NAME}</div>
        <nav aria-label="Main">
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink to={item.path} end className="nav-link" onClick={closeMenu}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="backdrop" data-open={menuOpen} onClick={closeMenu} aria-hidden="true" />

      <div className="app-body">
        <header className="header">
          <button
            type="button"
            className="button menu-toggle"
            aria-expanded={menuOpen}
            aria-controls={SIDEBAR_ID}
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
          <span className="header-brand">{APP_NAME}</span>
          <div className="header-actions">
            <UserMenu />
            <ThemeSelect />
          </div>
        </header>

        <main id={MAIN_CONTENT_ID} ref={mainRef} tabIndex={-1} className="main">
          <VerifyEmailBanner />
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <LegalFooter />
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV_ITEMS.filter((item) => item.primary).map((item) => (
          <NavLink key={item.path} to={item.path} end className="bottom-nav-link" onClick={closeMenu}>
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className="bottom-nav-link"
          aria-expanded={menuOpen}
          aria-controls={SIDEBAR_ID}
          onClick={() => setMenuOpen((open) => !open)}
        >
          More
        </button>
      </nav>
    </div>
  );
}
