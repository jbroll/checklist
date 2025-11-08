/**
 * Test Page - Only for E2E Testing
 *
 * This page is completely isolated from the main app and only accessible
 * via direct URL in development/test environments.
 *
 * Access: http://localhost:5173/test
 */

import { Beaker } from 'lucide-react';
import { useEffect } from 'react';
import { useAccount } from '@/lib/jazz';
import { Account } from '@/schemas';
import { exposeServicesToWindow } from '@/services/testHelpers';
import { TemplateEditor } from './components/editor/TemplateEditor';

export function TestPage() {
  const { me, logOut } = useAccount(Account);

  // Expose services to window for E2E tests
  useEffect(() => {
    if (me) {
      // @ts-expect-error Jazz TypeScript inference issue with Account root type
      exposeServicesToWindow(() => me);
      console.log('[TestPage] Services exposed for testing');

      // Add visual indicator that we're in test mode
      document.body.style.border = '5px solid orange';
      document.title = `TEST MODE - ${document.title}`;
    }
  }, [me]);

  const handleSignOut = async () => {
    try {
      await logOut();
      window.location.href = '/test';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-orange-50">
        <div className="max-w-md rounded-lg border-4 border-orange-500 bg-white p-8 text-center shadow-lg">
          <div className="mb-4 flex justify-center">
            <Beaker className="h-16 w-16 text-orange-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-orange-900">Test Mode</h1>
          <p className="mb-4 text-neutral-600">
            This is a test page for E2E testing.
            <br />
            Waiting for Jazz account to initialize...
          </p>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange-300 border-t-orange-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Test mode banner */}
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
        <Beaker className="h-4 w-4" />
        TEST MODE - Services Exposed for E2E Testing
      </div>

      {/* Main app with offset for banner */}
      <div className="pt-10">
        <TemplateEditor onSignOut={handleSignOut} />
      </div>
    </div>
  );
}
