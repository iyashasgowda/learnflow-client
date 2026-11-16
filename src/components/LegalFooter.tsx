import { Link } from 'react-router-dom';
import { LEGAL_PATHS } from '../constants';

// Links to the public legal pages. Shown on the sign-in pages, inside the app, and on the legal pages themselves.
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Legal">
        <ul className="legal-links">
          <li>
            <Link to={LEGAL_PATHS.terms}>Terms of Service</Link>
          </li>
          <li>
            <Link to={LEGAL_PATHS.privacy}>Privacy Policy</Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
