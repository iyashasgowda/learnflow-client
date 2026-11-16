import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Contains render failures so the surrounding shell stays usable.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div role="alert" className="card">
        <h1>Something went wrong</h1>
        <p>This page failed to load. Reloading usually fixes it. If it keeps happening, try again later.</p>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    );
  }
}
