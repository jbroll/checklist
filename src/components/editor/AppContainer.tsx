import { lazy, Suspense, useState } from 'react';
import { UpgradeBanner } from '@/components/billing';
import { TreeView } from '@/components/tree';
import { LoadingScreen } from '@/components/ui/loading';
import { ItemLimitExceededError, useCheckListHierarchy } from '@/hooks';
import { useDialogManager } from '@/lib/useDialogManager';
import { useTemplateNavigation } from '@/lib/useTemplateNavigation';
import { usePort, useRowboat } from '@/rowboat';
import * as sessionService from '@/services/sessionService';
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

/**
 * AppContainer — renders the folder tree (or a session view) over the rowboat graph.
 *
 * Template/session selection, the subscription/upgrade banner, and export/import dialogs are
 * wired onto the rowboat graph (`g` via `useRowboat()`) and the services (`sessionService`,
 * `subscriptionService`, `useCheckListHierarchy`).
 *
 * `currentSessionId` is intentionally LOCAL React state, not synced — there is no
 * cross-tab/browser-back session restore yet, since `useNavigationHistory` here only drives the
 * SessionView's own edit-mode toggle, not the template→session transition.
 */
export function AppContainer({
  onSignOut,
  onSignIn,
  onDeleteAccount,
  isAuthenticated,
}: AppContainerProps) {
  const { author, mintGroup } = usePort();
  const g = useRowboat();
  const { dialogs, openDialog, setDialogOpen } = useDialogManager();
  const { selectedTemplateId, selectedFolderId, selectTemplate, selectFolder, clearSelection } =
    useTemplateNavigation();

  const { addFolder, findById, getAllTemplateFolders } = useCheckListHierarchy({
    createdBy: author ?? 'anon',
    mintGroup,
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>(undefined);
  const [sessionExportData, setSessionExportData] = useState<SessionExportData | null>(null);

  const selectedFolder = selectedFolderId ? (findById(selectedFolderId) ?? null) : null;
  const importParentFolder =
    selectedFolder && selectedFolder.type === 'folder' ? selectedFolder : undefined;

  const handleAddFolder = async (name: string, isTemplate: boolean) => {
    try {
      if (isTemplate && !subscriptionService.canCreateList(g)) {
        throw new ItemLimitExceededError(subscriptionService.getMaxLists(g));
      }
      await addFolder(name, selectedFolderId ?? null, isTemplate ? 'template-folder' : 'folder');
    } catch (error) {
      if (error instanceof ItemLimitExceededError) {
        setUpgradeReason(`${error.maxItems} list limit reached`);
        openDialog('showUpgrade');
      } else {
        throw error;
      }
    }
  };

  const handleAddTemplateClick = () => {
    if (subscriptionService.isAtListLimit(g)) {
      setUpgradeReason(`${subscriptionService.getMaxLists(g)} list limit reached`);
      openDialog('showUpgrade');
    } else {
      openDialog('showAddTemplate');
    }
  };

  const handleHeaderClick = () => {
    clearSelection();
  };

  const handleBackToTemplates = () => {
    setCurrentSessionId(null);
    clearSelection();
  };

  const handleSwitchSession = (newSessionId: string) => {
    setCurrentSessionId(newSessionId);
  };

  const handleTemplateSelect = async (templateId: string) => {
    const sessions = sessionService.getSessions(g, templateId).filter((s) => !s.archived);

    let sessionId: string;
    if (sessions.length > 0) {
      const latest = sessions.reduce((latest, current) =>
        current.createdAt > latest.createdAt ? current : latest,
      );
      sessionId = latest.id;
    } else {
      sessionId = await sessionService.createSession(g, templateId);
    }

    selectTemplate(templateId);
    setCurrentSessionId(sessionId);
  };

  const handleExportSession = (templateId: string, sessionId: string) => {
    setSessionExportData({ templateId, sessionId });
    openDialog('showSessionExport');
  };

  // If viewing a shopping session, show SessionView.
  if (selectedTemplateId && currentSessionId) {
    const sessionTemplate = findById(selectedTemplateId);
    if (sessionTemplate) {
      return (
        <Suspense fallback={<LoadingScreen />}>
          <SessionView
            template={sessionTemplate}
            sessionId={currentSessionId}
            onBack={handleBackToTemplates}
            onSwitchSession={handleSwitchSession}
          />
        </Suspense>
      );
    }
  }

  return (
    <div className="h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0 p-3 sm:p-4 lg:p-6"
      >
        <UpgradeBanner onUpgradeClick={() => openDialog('showUpgrade')} />

        <TreeView
          selectedTemplateId={selectedTemplateId}
          selectedFolderId={selectedFolderId}
          selectionHandlers={{
            onFolderSelect: selectFolder,
            onTemplateSelect: (templateId) => {
              void handleTemplateSelect(templateId);
            },
            onOpenSession: (templateId, sessionId) => {
              selectTemplate(templateId);
              setCurrentSessionId(sessionId);
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
              subscriptionService.getSubscriptionTier(g),
            ),
            listCount: subscriptionService.countUserLists(g),
            maxLists: subscriptionService.getMaxLists(g),
            onUpgradeClick: () => openDialog('showUpgrade'),
          }}
        />

        <DialogManager
          dialogs={dialogs}
          setDialogOpen={setDialogOpen}
          importParentFolder={importParentFolder}
          onAddFolder={handleAddFolder}
          upgradeReason={upgradeReason}
          onUpgradeDialogClose={() => setUpgradeReason(undefined)}
          sessionExportData={sessionExportData}
          templates={getAllTemplateFolders()}
          authCallbacks={{
            onSignOut,
            onDeleteAccount,
          }}
        />
      </main>
    </div>
  );
}
