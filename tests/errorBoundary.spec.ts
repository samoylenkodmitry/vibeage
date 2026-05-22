import { describe, expect, it } from 'vitest';
import { GameErrorBoundary } from '../apps/client/src/ErrorBoundary';

/**
 * GameErrorBoundary unit tests — boundary itself, without rendering.
 *
 * React's class-based error boundary contract is two static + one
 * lifecycle method:
 *  - `getDerivedStateFromError(error)` → returns the next state object.
 *  - `componentDidCatch(error, info)` → side effects (logging).
 *  - `render()` → branch on `state.error`.
 *
 * The render path needs a DOM. The state transition does not — and
 * that's the part most worth pinning because it's the contract the
 * runtime depends on when a child throws. Render coverage is
 * implicit: if `state.error` is non-null, the fallback JSX runs;
 * Playwright/e2e tests would exercise the actual paint when added.
 */

describe('GameErrorBoundary state transition', () => {
  it('getDerivedStateFromError wraps the error into next state', () => {
    const err = new Error('boom');
    const next = GameErrorBoundary.getDerivedStateFromError(err);
    expect(next.error).toBe(err);
  });

  it('initial instance state is `error: null` (boundary is invisible until tripped)', () => {
    // Construct manually; React would do this on first mount.
    const instance = new GameErrorBoundary({ children: null });
    expect(instance.state.error).toBeNull();
  });

  it('getDerivedStateFromError preserves the Error reference exactly', () => {
    // The fallback renders `error.message`, so identity preservation
    // matters: the boundary must not box the error in a wrapper that
    // would lose the original stack / message.
    class DomainError extends Error {
      readonly code = 'E_DOMAIN';
    }
    const err = new DomainError('bad render');
    const next = GameErrorBoundary.getDerivedStateFromError(err);
    expect(next.error).toBeInstanceOf(DomainError);
    expect((next.error as DomainError | null)?.code).toBe('E_DOMAIN');
  });
});
