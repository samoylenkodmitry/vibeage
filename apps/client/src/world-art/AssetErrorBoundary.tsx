import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Narrow error boundary for the GLB foliage layer. React `Suspense`
 * only handles the *pending* state of a thrown promise; an actual
 * render-time error from `useGLTF` (parse failure, 404 on the
 * asset, GPU upload throw) skips Suspense and would otherwise
 * crash the whole `Canvas` subtree.
 *
 * Wrap `CozyPineForest`'s GLB layer with this and pass the
 * procedural fallback as `fallback`. If anything in the GLB
 * pipeline blows up at runtime, the cozy scene still paints
 * intentional geometry instead of going blank.
 *
 * Errors are logged to `console.error` so that telemetry/log
 * scraping picks them up.
 */
export class AssetErrorBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[cozy-asset-error] GLB foliage layer threw, falling back to procedural:', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
