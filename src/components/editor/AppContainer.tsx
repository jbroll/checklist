import type { InstanceOfSchema } from 'jazz-tools';
import { useEffect, useMemo, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { ExportDialog } from '@/components/export/ExportDialog';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { SessionView } from '@/components/session/SessionView';
import { SimplifiedApp } from '@/components/simplified/SimplifiedApp';
import { TreeView } from '@/components/tree';
import { useAccount } from '@/lib/jazz';
import type { Account, FolderNode, SessionData } from '@/schemas';
import * as folderService from '@/services/folderService';
import * as SessionService from '@/services/sessionService';
import { exposeServicesToWindow } from '@/services/testHelpers';
import * as viewStateService from '@/services/viewStateService';
import { AddFolderDialog } from './AddFolderDialog';
import { TemplateItemEditor } from './TemplateItemEditor';

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
  const { me } = useAccount<typeof Account>();

  // Expose services to window for E2E tests (development only)
  useEffect(() => {
    if (me && import.meta.env.DEV) {
      exposeServicesToWindow(() => me as InstanceOfSchema<typeof Account> | null);
    }
  }, [me]);

  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSessionExportDialog, setShowSessionExportDialog] = useState(false);
  const [sessionExportData, setSessionExportData] = useState<{
    templateId: string;
    sessionId: string;
  } | null>(null);

  // Selection state - tracks currently selected template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Selection state - tracks currently selected folder (organizational or template)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Navigation state for shopping session view
  const [activeSessionTemplateId, setActiveSessionTemplateId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Navigation state for template editing view
  const [activeEditTemplateId, setActiveEditTemplateId] = useState<string | null>(null);

  // Find selected folder for import (must be before early return)
  const selectedFolder = useMemo(() => {
    if (!me?.root?.folders || !selectedFolderId) return null;

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

    return findFolder(Array.from(me.root.folders));
  }, [selectedFolderId, me?.root?.folders]);

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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900 mx-auto" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If view mode is simplified, render SimplifiedApp instead of classic UI
  if (viewMode === 'simplified') {
    return (
      <SimplifiedApp
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
        account={me as any}
        onViewModeChange={onViewModeChange}
        onSignOut={onSignOut}
        onSignIn={onSignIn}
        onDeleteAccount={onDeleteAccount}
        isAuthenticated={isAuthenticated}
      />
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

    // Create folder (organizational or template)
    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
    folderService.createFolder(me as any, name, isTemplate, parent);
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

    // Navigate to shopping session view
    setActiveSessionTemplateId(selectedTemplateId);
    setActiveSessionId(sessionId);
  };

  const handleEditTemplate = () => {
    if (!selectedTemplateId) return;

    // Navigate to template editing view
    setActiveEditTemplateId(selectedTemplateId);
  };

  const handleBackToTemplates = () => {
    setActiveSessionTemplateId(null);
    setActiveSessionId(null);
  };

  const handleSwitchSession = (newSessionId: string) => {
    setActiveSessionId(newSessionId);
  };

  const handleBackFromEdit = () => {
    setActiveEditTemplateId(null);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
  };

  const handleHeaderClick = () => {
    // Clicking on BubbleList header deselects everything
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
        <SessionView
          // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
          template={sessionTemplate as any}
          sessionId={activeSessionId}
          onBack={handleBackToTemplates}
          onSwitchSession={handleSwitchSession}
        />
      );
    }
  }

  // Otherwise show Template Editor
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const accountAsAny = me as any;
  return (
    <div className="h-screen bg-neutral-50 p-3 sm:p-4 lg:p-6 flex flex-col">
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0"
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
            setActiveSessionTemplateId(templateId);
            setActiveSessionId(sessionId);
          }}
          onExportSession={handleExportSession}
          onHeaderClick={handleHeaderClick}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => setShowAddTemplate(true)}
          onExport={() => setShowExportDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          onDeleteAccount={onDeleteAccount}
          isAuthenticated={isAuthenticated}
          onSwitchToSimplified={() => onViewModeChange('simplified')}
          switchViewLabel="Basic View"
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

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          account={accountAsAny}
        />

        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          account={accountAsAny}
          parentFolder={importParentFolder}
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
                <SessionExportDialog
                  open={showSessionExportDialog}
                  onOpenChange={setShowSessionExportDialog}
                  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
                  template={template as any}
                  sessionId={sessionExportData.sessionId}
                  sessionName={sessionName}
                  account={accountAsAny}
                />
              );
            }
            return null;
          })()}
      </main>
    </div>
  );
}
