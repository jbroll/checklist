import type { InstanceOfSchema } from 'jazz-tools';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { UpgradeBanner } from '@/components/billing';
import { TreeView } from '@/components/tree';
import { LoadingScreen } from '@/components/ui/loading';
import {
  ItemLimitExceededError,
  isOrganizationalFolder,
  isTemplateFolder,
  useCheckListHierarchy,
} from '@/hooks';
import { useDialog } from '@/lib/dialog-context';
import { useAccount } from '@/lib/jazz';
import { useDialogManager } from '@/lib/useDialogManager';
import { useNavigationHistory } from '@/lib/useNavigationHistory';
import { useTemplateNavigation } from '@/lib/useTemplateNavigation';
import type { FolderNode } from '@/schemas';
import { ACCOUNT_RESOLVE, Account } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import * as subscriptionService from '@/services/subscriptionService';
import { DialogManager, type SessionExportData } from './DialogManager';

// Lazy load heavy components to reduce initial bundle
const SessionView = lazy(() =>
  import('@/components/session/SessionView').then((m) => ({ default: m.SessionView })),
);

interface AppContainerProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  isAuthenticated: boolean;
}

export function AppContainer({
  onSignOut,
  onSignIn,
  onDeleteAccount,
  isAuthenticated,
}: AppContainerProps) {
  // Jazz 0.20: pass the Account schema + resolve query so the folder tree is
  // deep-loaded ($each); without it root.folders yields null elements.
  // biome-ignore lint/suspicious/noExplicitAny: Jazz MaybeLoaded type requires runtime checks
  const me = useAccount(Account, { resolve: ACCOUNT_RESOLVE }) as any;
  const { navState, navigateTo, goBack, replaceState } = useNavigationHistory();
  const { showAlert } = useDialog();

  // Centralized dialog management
  const { dialogs, openDialog, setDialogOpen } = useDialogManager();

  // Template and folder selection state
  const { selectedTemplateId, selectedFolderId, selectTemplate, selectFolder, clearSelection } =
    useTemplateNavigation();

  // Hierarchy management hook
  const { findById, addFolder, getAllTemplateFolders } = useCheckListHierarchy(me);

  // Upgrade dialog reason state (separate from dialog manager for the message)
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>(undefined);

  // Session export data state
  const [sessionExportData, setSessionExportData] = useState<SessionExportData | null>(null);

  // Dynamically load and expose services to window for E2E tests (only when __PLAYWRIGHT__ flag is set)
  useEffect(() => {
    if (me && (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__) {
      import('@/services/testHelpers').then(({ exposeServicesToWindow }) => {
        exposeServicesToWindow(() => me as InstanceOfSchema<typeof Account> | null);
      });
    }
  }, [me]);

  // Find selected folder for import (must be before early return)
  const selectedFolder = useMemo(() => {
    if (!me || !selectedFolderId) return null;
    return findById(selectedFolderId);
  }, [selectedFolderId, me, findById]);

  // Compute parent folder for import based on selected folder
  const importParentFolder = useMemo(() => {
    if (!selectedFolder) return undefined;
    // Only use organizational folders as import parents
    return isOrganizationalFolder(selectedFolder) ? selectedFolder : undefined;
  }, [selectedFolder]);

  // Derive navigation state from history hook
  const activeSessionTemplateId = navState.view === 'session' ? navState.templateId : null;
  const activeSessionId = navState.view === 'session' ? navState.sessionId : null;

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900 dark:border-neutral-600 dark:border-t-neutral-100 mx-auto" />
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Get all template folders from the hierarchy
  const templates = getAllTemplateFolders();

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!me.root) return;

    // Determine parent folder based on selection
    let parent: InstanceOfSchema<typeof FolderNode> | undefined;
    if (selectedFolder) {
      if (isOrganizationalFolder(selectedFolder)) {
        // If selected folder is organizational, create inside it
        parent = selectedFolder;
      } else if (isTemplateFolder(selectedFolder)) {
        // If selected folder is a template, create at the same level (sibling)
        parent = selectedFolder.parent || undefined;
      }
    }

    try {
      addFolder(name, parent, isTemplate);
    } catch (error) {
      if (error instanceof ItemLimitExceededError) {
        showAlert({
          title: 'List Limit Reached',
          message: `You've reached your limit of ${error.maxItems} lists. Upgrade your plan to create more.`,
        });
      } else {
        throw error;
      }
    }
  };

  const handleBackToTemplates = () => {
    goBack();
  };

  const handleSwitchSession = (newSessionId: string) => {
    // Replace current history entry with new session (don't add to stack)
    if (activeSessionTemplateId) {
      replaceState({
        view: 'session',
        templateId: activeSessionTemplateId,
        sessionId: newSessionId,
      });
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    // Find the template folder
    const template = templates.find((t) => t?.$jazz.id === templateId);
    if (!template) return;

    // Always use the latest session (or create one)
    const sessions = SessionService.getSessions(me, templateId);
    const activeSessions = sessions.filter((s) => !s.archived);

    let sessionId: string;
    if (activeSessions.length > 0) {
      // Find latest session by createdAt
      const latestSession = activeSessions.reduce((latest, current) => {
        const latestTime = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
        const currentTime = current?.createdAt ? new Date(current.createdAt).getTime() : 0;
        return currentTime > latestTime ? current : latest;
      });
      sessionId = latestSession.id;
    } else {
      // No session exists - create a new one
      // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
      sessionId = SessionService.createSession(me as any, templateId);
    }

    // Navigate to session view (with browser history)
    selectTemplate(templateId);
    navigateTo({ view: 'session', templateId, sessionId });
  };

  const handleFolderSelect = (folderId: string) => {
    selectFolder(folderId);
  };

  const handleHeaderClick = () => {
    // Clicking on header deselects everything
    clearSelection();
  };

  const handleExportSession = (templateId: string, sessionId: string) => {
    setSessionExportData({ templateId, sessionId });
    openDialog('showSessionExport');
  };

  const handleAddTemplateClick = () => {
    if (subscriptionService.isAtListLimit(me)) {
      const maxLists = subscriptionService.getMaxLists(me);
      setUpgradeReason(`${maxLists} list limit reached`);
      openDialog('showUpgrade');
    } else {
      openDialog('showAddTemplate');
    }
  };

  // If viewing a shopping session, show SessionView
  if (activeSessionTemplateId && activeSessionId) {
    const sessionTemplate = templates.find((t) => t?.$jazz.id === activeSessionTemplateId);
    if (sessionTemplate) {
      return (
        <Suspense fallback={<LoadingScreen />}>
          <SessionView
            // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
            template={sessionTemplate as any}
            sessionId={activeSessionId}
            onBack={handleBackToTemplates}
            onSwitchSession={handleSwitchSession}
          />
        </Suspense>
      );
    }
  }

  // Otherwise show Tree View
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const accountAsAny = me as any;

  return (
    <div className="h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      {/* Upgrade banner - shows when approaching list limit */}
      <UpgradeBanner account={me} onUpgradeClick={() => openDialog('showUpgrade')} />
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0 p-3 sm:p-4 lg:p-6"
      >
        <TreeView
          account={accountAsAny}
          selectedTemplateId={selectedTemplateId}
          selectedFolderId={selectedFolderId}
          selectionHandlers={{
            onTemplateSelect: handleTemplateSelect,
            onFolderSelect: handleFolderSelect,
            onOpenSession: (templateId, sessionId) => {
              navigateTo({ view: 'session', templateId, sessionId });
            },
            onExportSession: handleExportSession,
          }}
          headerActions={{
            onHeaderClick: handleHeaderClick,
            onAddFolder: () => openDialog('showAddFolder'),
            onAddTemplate: handleAddTemplateClick,
            onExport: () => openDialog('showExport'),
            onImport: () => openDialog('showImport'),
          }}
          authProps={{
            onSignOut,
            onSignIn,
            onDeleteAccount,
            isAuthenticated,
            showProfileDialog: dialogs.showProfile,
            onShowProfileDialogChange: (show) => setDialogOpen('showProfile', show),
          }}
          subscriptionInfo={{
            subscriptionTier: subscriptionService.getTierDisplayName(
              subscriptionService.getSubscriptionTier(me),
            ),
            listCount: subscriptionService.countUserLists(me),
            maxLists: subscriptionService.getMaxLists(me),
            onUpgradeClick: () => openDialog('showUpgrade'),
          }}
        />

        {/* All dialogs rendered via DialogManager */}
        <DialogManager
          dialogs={dialogs}
          setDialogOpen={setDialogOpen}
          account={me}
          importParentFolder={importParentFolder}
          onAddFolder={handleAddFolder}
          upgradeReason={upgradeReason}
          onUpgradeDialogClose={() => setUpgradeReason(undefined)}
          sessionExportData={sessionExportData}
          templates={templates}
          authCallbacks={{
            onSignOut,
            onDeleteAccount,
          }}
        />
      </main>
    </div>
  );
}
