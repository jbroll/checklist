/**
 * Test Page - Only for E2E Testing
 *
 * This page is completely isolated from the main app and only accessible
 * via direct URL in development/test environments.
 *
 * Access: http://localhost:5173/test
 *
 * Rowboat port (slice-2): reads the bound graph via `useRowboat()` (was Jazz `useAccount`) and
 * hands it to `exposeServicesToWindow(g)`, which publishes the graph + ported services on
 * `window.testExports` for Playwright seeding. The graph is always available inside
 * `<RowboatProvider>`, so — unlike the Jazz version — there is no "waiting for account" state.
 */

import { Beaker } from 'lucide-react';
import { useEffect } from 'react';
import { useRowboat } from '@/rowboat';
import { exposeServicesToWindow } from '@/services/testHelpers';
import { AppContainer } from './components/editor/AppContainer';

export function TestPage() {
  const g = useRowboat();

  // Expose services to window for E2E tests
  useEffect(() => {
    exposeServicesToWindow(g);
    console.log('[TestPage] Test mode active - services exposed to window.testExports');

    // Add visual indicator that we're in test mode
    document.body.style.border = '5px solid orange';
    document.title = `TEST MODE - ${document.title}`;
  }, [g]);

  return (
    <div className="relative">
      {/* Test mode banner */}
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
        <Beaker className="h-4 w-4" />
        TEST MODE - Services Exposed for E2E Testing
      </div>

      {/* Main app with offset for banner */}
      <div className="pt-10">
        <AppContainer isAuthenticated={true} />
      </div>
    </div>
  );
}
