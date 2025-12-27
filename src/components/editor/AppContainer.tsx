import type { InstanceOfSchema } from 'jazz-tools';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { UpgradeBanner, UpgradeDialog } from '@/components/billing';
import { TreeView } from '@/components/tree';
import { LoadingScreen } from '@/components/ui/loading';
import { useDialog } from '@/lib/dialog-context';
import { useAccount } from '@/lib/jazz';
import { useNavigationHistory } from '@/lib/useNavigationHistory';
import type { Account, FolderNode, SessionData } from '@/schemas';
import * as folderService from '@/services/folderService';
import { ListLimitExceededError } from '@/services/folderService';
import * as SessionService from '@/services/sessionService';
import * as subscriptionService from '@/services/subscriptionService';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';
import { AddFolderDialog } from './AddFolderDialog';
import { TemplateItemEditor } from './TemplateItemEditor';

// Lazy load heavy components to reduce initial bundle
const SessionView = lazy(() =>
  import('@/components/session/SessionView').then((m) => ({ default: m.SessionView })),
);
const SimplifiedApp = lazy(() =>
  import('@/components/simplified/SimplifiedApp').then((m) => ({ default: m.SimplifiedApp })),
);
const ProfileDialog = lazy(() =>
  import('@/components/auth/ProfileDialog').then((m) => ({ default: m.ProfileDialog })),
);
const ExportDialog = lazy(() =>
  import('@/components/export/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const SessionExportDialog = lazy(() =>
  import('@/components/export/SessionExportDialog').then((m) => ({
    default: m.SessionExportDialog,
  })),
);
const ImportDialog = lazy(() =>
  import('@/components/import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

interface AppContainerProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isAuthenticated: boolean;
}

export function AppContainer({
  onSignOut,
  onSignIn,
  onDeleteAccount,
  viewMode,
  onViewModeChange,
  isAuthenticated,
}: AppContainerProps) {
  // Jazz 0.19: useAccount returns MaybeLoaded, need explicit type handling
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.19 MaybeLoaded type requires runtime checks
  const me = useAccount<typeof Account>() as any;
  const { navState, navigateTo, goBack, replaceState } = useNavigationHistory();
  const { showAlert } = useDialog();

  // Dynamically load and expose services to window for E2E tests (only when __PLAYWRIGHT__ flag is set)
  useEffect(() => {
    if (me && (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__) {
      import('@/services/testHelpers').then(({ exposeServicesToWindow }) => {
        exposeServicesToWindow(() => me as InstanceOfSchema<typeof Account> | null);
      });
    }
  }, [me]);

  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSessionExportDialog, setShowSessionExportDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | undefined>(undefined);
  const [sessionExportData, setSessionExportData] = useState<{
    templateId: string;
    sessionId: string;
  } | null>(null);

  // Selection state - tracks currently selected template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Selection state - tracks currently selected folder (organizational or template)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Derive navigation state from history hook
  const activeSessionTemplateId = navState.view === 'session' ? navState.templateId : null;
  const activeSessionId = navState.view === 'session' ? navState.sessionId : null;
  const activeEditTemplateId = navState.view === 'edit' ? navState.templateId : null;

  // Find selected folder for import (must be before early return)
  const selectedFolder = useMemo(() => {
    if (!me || !selectedFolderId) return null;
    return folderService.findFolderById(me, selectedFolderId);
  }, [selectedFolderId, me]);

  // Compute parent folder for import based on selected folder
  const importParentFolder = useMemo(() => {
    if (!selectedFolder) return undefined;
    // Only use organizational folders as import parents
    return folderService.isOrganizationalFolder(selectedFolder) ? selectedFolder : undefined;
  }, [selectedFolder]);

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

  // Compute switch view label based on current mode
  const switchViewLabel = viewMode === 'simplified' ? 'Advanced View' : 'Basic View';

  // If view mode is simplified, render SimplifiedApp instead of classic UI
  if (viewMode === 'simplified') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <SimplifiedApp
          // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
          account={me as any}
          onViewModeChange={onViewModeChange}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          onDeleteAccount={onDeleteAccount}
          isAuthenticated={isAuthenticated}
          showProfileDialog={showProfileDialog}
          onShowProfileDialogChange={setShowProfileDialog}
        />
        {onSignOut && onDeleteAccount && (
          <Suspense fallback={null}>
            <ProfileDialog
              open={showProfileDialog}
              onOpenChange={setShowProfileDialog}
              onSignOut={onSignOut}
              onDeleteAccount={onDeleteAccount}
              onSwitchView={() => onViewModeChange('classic')}
              switchViewLabel={switchViewLabel}
              defaultAutocompleteDomain={userSettingsService.getDefaultAutocompleteDomain(me)}
              enableAutoCategorization={userSettingsService.getEnableAutoCategorization(me)}
              onChangeDefaultAutocompleteDomain={(domain) =>
                userSettingsService.setDefaultAutocompleteDomain(me, domain)
              }
              onToggleAutoCategorization={() =>
                userSettingsService.toggleEnableAutoCategorization(me)
              }
              subscriptionTier={subscriptionService.getSubscriptionTier(me)}
              listCount={subscriptionService.countUserLists(me)}
              maxLists={subscriptionService.getMaxLists(me)}
              onUpgradeClick={() => {
                setShowProfileDialog(false);
                setShowUpgradeDialog(true);
              }}
              onManageBillingClick={() => subscriptionService.redirectToPortal()}
            />
          </Suspense>
        )}
      </Suspense>
    );
  }

  // Otherwise render classic UI below
  // Get all template folders from the hierarchy
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const templates = folderService.getAllTemplateFolders(me as any);

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!me.root) return;

    // Determine parent folder based on selection
    let parent: InstanceOfSchema<typeof FolderNode> | null = null;
    if (selectedFolder) {
      if (folderService.isOrganizationalFolder(selectedFolder)) {
        // If selected folder is organizational, create inside it
        parent = selectedFolder;
      } else if (folderService.isTemplateFolder(selectedFolder)) {
        // If selected folder is a template, create at the same level (sibling)
        parent = selectedFolder.parent || null;
      }
    }

    try {
      // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
      folderService.createFolder(me as any, name, isTemplate, parent);
    } catch (error) {
      if (error instanceof ListLimitExceededError) {
        showAlert({
          title: 'List Limit Reached',
          message: `You've reached your limit of ${error.maxLists} lists. Upgrade your plan to create more.`,
        });
      } else {
        throw error;
      }
    }
  };

  const handleUseTemplate = () => {
    if (!selectedTemplateId || !selectedFolder) return;

    // Expand the template and its ancestors so it's visible when returning (using viewState)
    let current = selectedFolder.parent;
    while (current) {
      viewStateService.setFolderExpanded(me, current.$jazz.id, true);
      current = current.parent;
    }
    viewStateService.setFolderExpanded(me, selectedFolder.$jazz.id, true);

    // Create session using service
    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
    const sessionId = SessionService.createSession(me as any, selectedTemplateId);

    // Navigate to shopping session view (with browser history)
    navigateTo({ view: 'session', templateId: selectedTemplateId, sessionId });
  };

  const handleEditTemplate = () => {
    if (!selectedTemplateId) return;

    // Navigate to template editing view (with browser history)
    navigateTo({ view: 'edit', templateId: selectedTemplateId });
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

  const handleBackFromEdit = () => {
    goBack();
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
  };

  const handleHeaderClick = () => {
    // Clicking on header deselects everything
    setSelectedTemplateId(null);
    setSelectedFolderId(null);
  };

  const handleExportSession = (templateId: string, sessionId: string) => {
    setSessionExportData({ templateId, sessionId });
    setShowSessionExportDialog(true);
  };

  // If editing a template, show TemplateItemEditor
  if (activeEditTemplateId) {
    const editTemplate = templates.find((t) => t?.$jazz.id === activeEditTemplateId);
    if (editTemplate) {
      // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
      return <TemplateItemEditor template={editTemplate as any} onBack={handleBackFromEdit} />;
    }
  }

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

  // Otherwise show Template Editor
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const accountAsAny = me as any;
  return (
    <div className="h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      {/* Upgrade banner - shows when approaching list limit */}
      <UpgradeBanner account={me} onUpgradeClick={() => setShowUpgradeDialog(true)} />
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0 p-3 sm:p-4 lg:p-6"
      >
        <TreeView
          account={accountAsAny}
          selectedTemplateId={selectedTemplateId}
          selectedFolderId={selectedFolderId}
          onTemplateSelect={handleTemplateSelect}
          onFolderSelect={handleFolderSelect}
          onUseTemplate={handleUseTemplate}
          onEditTemplate={handleEditTemplate}
          onOpenSession={(templateId, sessionId) => {
            navigateTo({ view: 'session', templateId, sessionId });
          }}
          onExportSession={handleExportSession}
          onHeaderClick={handleHeaderClick}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => {
            // Check if at list limit before showing add template dialog
            if (subscriptionService.isAtListLimit(me)) {
              setUpgradeMessage("You've reached your list limit.");
              setShowUpgradeDialog(true);
            } else {
              setShowAddTemplate(true);
            }
          }}
          onExport={() => setShowExportDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          onDeleteAccount={onDeleteAccount}
          isAuthenticated={isAuthenticated}
          onSwitchToSimplified={() => onViewModeChange('simplified')}
          switchViewLabel={switchViewLabel}
          showProfileDialog={showProfileDialog}
          onShowProfileDialogChange={setShowProfileDialog}
          sessionsEnabled={true}
        />

        <AddFolderDialog
          open={showAddFolder}
          onOpenChange={setShowAddFolder}
          onAdd={handleAddFolder}
        />

        <AddFolderDialog
          open={showAddTemplate}
          onOpenChange={setShowAddTemplate}
          onAdd={handleAddFolder}
          defaultIsTemplate={true}
          title="New List"
          description="Create a new list folder for frequently purchased items."
        />

        <Suspense fallback={null}>
          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            account={accountAsAny}
          />
        </Suspense>

        <Suspense fallback={null}>
          <ImportDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            account={accountAsAny}
            parentFolder={importParentFolder}
          />
        </Suspense>

        {/* Upgrade Dialog */}
        <UpgradeDialog
          open={showUpgradeDialog}
          onOpenChange={setShowUpgradeDialog}
          account={me}
          message={upgradeMessage}
        />

        {/* Session Export Dialog */}
        {sessionExportData &&
          (() => {
            const template = templates.find((t) => t?.$jazz.id === sessionExportData.templateId);
            const sessions = template?.sessions
              ? Array.isArray(template.sessions)
                ? template.sessions
                : // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x sessions may be CoList or array
                  Array.from(template.sessions as any)
              : [];
            const session = sessions.find(
              (s: SessionData) => s?.id === sessionExportData.sessionId,
            );
            if (template && session) {
              // Generate session name from createdAt
              const sessionName = new Date(session.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
              return (
                <Suspense fallback={null}>
                  <SessionExportDialog
                    open={showSessionExportDialog}
                    onOpenChange={setShowSessionExportDialog}
                    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
                    template={template as any}
                    sessionId={sessionExportData.sessionId}
                    sessionName={sessionName}
                    account={accountAsAny}
                  />
                </Suspense>
              );
            }
            return null;
          })()}

        {/* Profile Dialog */}
        {onSignOut && onDeleteAccount && (
          <Suspense fallback={null}>
            <ProfileDialog
              open={showProfileDialog}
              onOpenChange={setShowProfileDialog}
              onSignOut={onSignOut}
              onDeleteAccount={onDeleteAccount}
              onSwitchView={() => onViewModeChange('simplified')}
              switchViewLabel={switchViewLabel}
              defaultAutocompleteDomain={userSettingsService.getDefaultAutocompleteDomain(me)}
              enableAutoCategorization={userSettingsService.getEnableAutoCategorization(me)}
              onChangeDefaultAutocompleteDomain={(domain) =>
                userSettingsService.setDefaultAutocompleteDomain(me, domain)
              }
              onToggleAutoCategorization={() =>
                userSettingsService.toggleEnableAutoCategorization(me)
              }
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}
