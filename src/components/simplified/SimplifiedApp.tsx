import type { InstanceOfSchema } from 'jazz-tools';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { AddFolderDialog } from '@/components/editor/AddFolderDialog';
import { TreeView } from '@/components/tree/TreeView';
import { LoadingScreen } from '@/components/ui/loading';
import type { Account, FolderNode } from '@/schemas';
import * as folderService from '@/services/folderService';
import * as sessionService from '@/services/sessionService';

// Lazy load heavy components
const ExportDialog = lazy(() =>
  import('@/components/export/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const ImportDialog = lazy(() =>
  import('@/components/import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);
const SessionView = lazy(() =>
  import('@/components/session/SessionView').then((m) => ({ default: m.SessionView })),
);

interface SimplifiedAppProps {
  account: InstanceOfSchema<typeof Account>;
  onViewModeChange: (mode: ViewMode) => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  isAuthenticated: boolean;
  showProfileDialog?: boolean;
  onShowProfileDialogChange?: (show: boolean) => void;
}

/**
 * Top-level container for the simplified UI mode
 * This is a completely separate component tree from the classic Dashboard/TreeView
 * Manages navigation between template selection and session view
 */
export function SimplifiedApp({
  account,
  onViewModeChange,
  onSignOut,
  onSignIn,
  onDeleteAccount,
  isAuthenticated,
  showProfileDialog,
  onShowProfileDialogChange,
}: SimplifiedAppProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Find selected folder for import
  const selectedFolder = useMemo(() => {
    if (!account?.root?.folders || !selectedFolderId) return null;

    const findFolder = (
      folders: InstanceOfSchema<typeof FolderNode>[],
    ): InstanceOfSchema<typeof FolderNode> | null => {
      for (const f of folders) {
        if (!f) continue;
        if (f.$jazz.id === selectedFolderId) return f;
        if (f.children) {
          const found = findFolder(f.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findFolder(Array.from(account.root.folders));
  }, [selectedFolderId, account?.root?.folders]);

  // Compute parent folder for import based on selected folder
  const importParentFolder = useMemo(() => {
    if (!selectedFolder) return undefined;
    // Only use organizational folders as import parents
    return folderService.isOrganizationalFolder(selectedFolder) ? selectedFolder : undefined;
  }, [selectedFolder]);

  // No useEffect needed - session is created directly in handleTemplateSelect

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!account.root) return;

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

    // Create folder (organizational or template)
    folderService.createFolder(account, name, isTemplate, parent);
  };

  // If a template is selected, show session view
  if (selectedTemplateId && currentSessionId && selectedFolder) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <SessionView
          template={selectedFolder}
          sessionId={currentSessionId}
          onBack={() => {
            setSelectedTemplateId(null);
            setSelectedFolderId(null);
            setCurrentSessionId(null);
          }}
          onSwitchSession={(newSessionId) => {
            setCurrentSessionId(newSessionId);
          }}
        />
      </Suspense>
    );
  }

  const handleTemplateSelect = (templateId: string) => {
    // Find the template folder
    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
    const templates = folderService.getAllTemplateFolders(account as any);
    const template = templates.find((t) => t?.$jazz.id === templateId);

    if (template) {
      // In simplified mode, always use the latest session (or create one)
      const sessions = sessionService.getSessions(account, template.$jazz.id);
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
        sessionId = sessionService.createSession(account, template.$jazz.id);
      }

      // Set all state together to avoid intermediate renders
      setSelectedTemplateId(templateId);
      setSelectedFolderId(templateId);
      setCurrentSessionId(sessionId);
    }
  };

  const handleFolderSelect = (folderId: string) => {
    // Find the folder
    const findFolder = (
      folders: InstanceOfSchema<typeof FolderNode>[],
    ): InstanceOfSchema<typeof FolderNode> | null => {
      for (const f of folders) {
        if (!f) continue;
        if (f.$jazz.id === folderId) return f;
        if (f.children) {
          const found = findFolder(f.children);
          if (found) return found;
        }
      }
      return null;
    };

    const folder = account.root?.folders ? findFolder(Array.from(account.root.folders)) : null;

    // Only set selectedFolderId for folders (not templates in simplified mode)
    if (folder && folderService.isOrganizationalFolder(folder)) {
      setSelectedFolderId(folderId);
    }
  };

  const handleHeaderClick = () => {
    // Clicking on BubbleList header deselects everything
    setSelectedTemplateId(null);
    setSelectedFolderId(null);
  };

  const handleUseTemplate = () => {
    if (!selectedTemplateId) return;
    // Navigation to SessionView happens automatically when selectedTemplateId is set
    // Template is already selected, so this just confirms the action
  };

  const handleEditTemplate = () => {
    if (!selectedTemplateId) return;
    // For simplified view, we also just navigate to session view (no separate edit mode)
    // Could be enhanced later to show a different view
  };

  // Otherwise show template selector using TreeView with sessionsEnabled=false
  return (
    <div className="h-screen bg-surface-secondary p-3 sm:p-4 lg:p-6 flex flex-col">
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0"
      >
        <TreeView
          account={account}
          selectedTemplateId={selectedTemplateId}
          selectedFolderId={selectedFolderId}
          onTemplateSelect={handleTemplateSelect}
          onFolderSelect={handleFolderSelect}
          onUseTemplate={handleUseTemplate}
          onEditTemplate={handleEditTemplate}
          onHeaderClick={handleHeaderClick}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => setShowAddTemplate(true)}
          onExport={() => setShowExportDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          onDeleteAccount={onDeleteAccount}
          isAuthenticated={isAuthenticated}
          onSwitchToSimplified={() => onViewModeChange('classic')}
          switchViewLabel="Advanced View"
          showProfileDialog={showProfileDialog}
          onShowProfileDialogChange={onShowProfileDialogChange}
          sessionsEnabled={false}
          hideArchivedSessionsToggle={true}
          hideArchiveAction={true}
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
            account={account}
          />
        </Suspense>

        <Suspense fallback={null}>
          <ImportDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            account={account}
            parentFolder={importParentFolder}
          />
        </Suspense>
      </main>
    </div>
  );
}
