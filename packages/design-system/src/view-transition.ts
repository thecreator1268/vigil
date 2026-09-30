import { flushSync } from 'react-dom';

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Route-level / shared-element transitions via the native View Transitions
 * API (zero bundle weight). Falls back to a plain state change where the API
 * is unsupported. Not interruptible — use Framer Motion for anything a user
 * might interrupt mid-flight.
 */
export function navigateWithTransition(to: string, setRoute: (r: string) => void): void {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition) {
    setRoute(to); // graceful fallback for unsupported browsers
    return;
  }
  doc.startViewTransition(() => {
    flushSync(() => setRoute(to));
  });
}

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}
