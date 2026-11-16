import type { ReactNode } from 'react';
import { APP_NAME } from '../navigation';
import { LegalFooter } from './LegalFooter';
import { ThemeSelect } from './ThemeSelect';

interface Props {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthCard({ title, children, footer }: Props) {
  return (
    <main className="auth-page">
      <div className="auth-theme">
        <ThemeSelect />
      </div>
      <section className="card auth-card" aria-labelledby="auth-heading">
        <p className="brand">{APP_NAME}</p>
        <h1 id="auth-heading">{title}</h1>
        {children}
        <p className="auth-footer">{footer}</p>
      </section>
      <LegalFooter />
    </main>
  );
}
