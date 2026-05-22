import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  /** Last captured error or `null` when the boundary hasn't tripped. */
  error: Error | null;
};

/**
 * Top-level error boundary for the game UI.
 *
 * Without this, a render-time exception in any child component (a
 * faulty HUD panel, a malformed snapshot, a third-party VFX library
 * throwing on an edge-case mesh) crashes the whole React tree. The
 * user sees a blank page with no path to recover except a manual
 * refresh.
 *
 * The boundary catches the exception, logs it to console.error
 * (preserves the original stack for triage), and renders a minimal
 * fallback that lets the player reload the page.
 *
 * Intentionally narrow: this is a static fallback, not an attempt
 * to surgically re-mount the failing subtree. Game UI carries a lot
 * of mutual state; resetting just the failing branch tends to leave
 * everything else in a half-broken state. Reload is the safer choice
 * and matches what a player would do anyway when the screen freezes.
 */
export class GameErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('GameErrorBoundary caught a render-time error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary-fallback" role="alert">
        <h1>Something broke in the game UI</h1>
        <p>The page can recover by reloading. Your character is saved on the server.</p>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    );
  }
}
