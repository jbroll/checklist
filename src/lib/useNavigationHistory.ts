import { useCallback, useEffect, useState } from 'react';

/**
 * Navigation state types for the app
 */
export type NavState =
  | { view: 'main' }
  | { view: 'session'; templateId: string; sessionId: string; editing?: boolean }
  | { view: 'edit'; templateId: string };

/**
 * Parse URL hash to determine navigation state
 */
function parseHash(hash: string): NavState {
  // Remove leading # if present
  const path = hash.startsWith('#') ? hash.slice(1) : hash;

  if (!path || path === '/') {
    return { view: 'main' };
  }

  // Parse session edit view: #session/{templateId}/{sessionId}/edit
  const sessionEditMatch = path.match(/^session\/([^/]+)\/([^/]+)\/edit$/);
  if (sessionEditMatch) {
    return {
      view: 'session',
      templateId: sessionEditMatch[1],
      sessionId: sessionEditMatch[2],
      editing: true,
    };
  }

  // Parse session view: #session/{templateId}/{sessionId}
  const sessionMatch = path.match(/^session\/([^/]+)\/([^/]+)$/);
  if (sessionMatch) {
    return {
      view: 'session',
      templateId: sessionMatch[1],
      sessionId: sessionMatch[2],
    };
  }

  // Parse edit view: #edit/{templateId}
  const editMatch = path.match(/^edit\/([^/]+)$/);
  if (editMatch) {
    return {
      view: 'edit',
      templateId: editMatch[1],
    };
  }

  // Default to main view for invalid hashes
  return { view: 'main' };
}

/**
 * Convert navigation state to URL hash
 */
function stateToHash(state: NavState): string {
  switch (state.view) {
    case 'session':
      if (state.editing) {
        return `#session/${state.templateId}/${state.sessionId}/edit`;
      }
      return `#session/${state.templateId}/${state.sessionId}`;
    case 'edit':
      return `#edit/${state.templateId}`;
    default:
      return '';
  }
}

/**
 * Hook to manage browser history for app navigation
 *
 * Supports:
 * - Back/forward browser buttons
 * - Deep linking via URL hash
 * - Programmatic navigation
 */
export function useNavigationHistory() {
  const [navState, setNavState] = useState<NavState>(() => parseHash(window.location.hash));

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setNavState(parseHash(window.location.hash));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate to a new state (pushes to history)
  const navigateTo = useCallback((newState: NavState) => {
    const newHash = stateToHash(newState);
    const currentHash = window.location.hash;

    // Only push if actually changing
    if (newHash !== currentHash) {
      window.history.pushState(null, '', newHash || window.location.pathname);
    }
    setNavState(newState);
  }, []);

  // Go back in history (or to main if no history)
  const goBack = useCallback(() => {
    // Check if we have history to go back to
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // No history, navigate to main
      navigateTo({ view: 'main' });
    }
  }, [navigateTo]);

  // Replace current state without adding history entry
  const replaceState = useCallback((newState: NavState) => {
    const newHash = stateToHash(newState);
    window.history.replaceState(null, '', newHash || window.location.pathname);
    setNavState(newState);
  }, []);

  return {
    navState,
    navigateTo,
    goBack,
    replaceState,
  };
}
