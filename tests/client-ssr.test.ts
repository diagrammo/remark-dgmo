import { describe, it, expect, vi, afterEach } from 'vitest';
import { bindDgmo } from '../src/client.js';

// Guards the SSR-safety contract of the browser client: it must be a no-op in
// any non-interactive-browser environment, INCLUDING the partial-DOM case that
// some SSG renderers (Docusaurus static export) expose — `window`/`document`
// are defined but `MutationObserver`/`requestAnimationFrame` are not. Before
// the feature-detect guard, that case threw `MutationObserver is not defined`
// during server render.
describe('client SSR safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a no-op in pure Node (no window/document)', () => {
    expect(() => bindDgmo()).not.toThrow();
  });

  it('bails on a partial DOM (window + document, no MutationObserver/rAF)', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      documentElement: {},
      readyState: 'complete',
    });
    // MutationObserver and requestAnimationFrame intentionally absent.
    expect(() => bindDgmo()).not.toThrow();
  });

  it('binds in a real interactive browser environment', () => {
    const addEventListener = vi.fn();
    class FakeMutationObserver {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      addEventListener,
      querySelectorAll: vi.fn(() => []),
      documentElement: {},
      readyState: 'complete',
    });
    vi.stubGlobal('MutationObserver', FakeMutationObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    expect(() => bindDgmo()).not.toThrow();
    // Capture phase (third arg true): the handler must beat framework-level
    // click delegation (Docusaurus's Details toggle) to in-summary buttons.
    expect(addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      true
    );
  });
});
