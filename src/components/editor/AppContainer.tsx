import { useMemo, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { ExportDialog } from '@/components/export/ExportDialog';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { SessionView } from '@/components/session/SessionView';
import { SimplifiedApp } from '@/components/simplified/SimplifiedApp';
import { TreeView } from '@/components/tree';
import { useAccount } from '@/lib/jazz';
import type { Account } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as SessionService from '@/services/sessionService';
import { PATH_SEPARATOR } from '@/utils/pathUtils';
import { AddFolderDialog } from './AddFolderDialog';
import { TemplateItemEditor } from './TemplateItemEditor';

interface AppContainerProps {
  onSignOut?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function AppContainer({ onSignOut, viewMode, onViewModeChange }: AppContainerProps) {
  const { me } = useAccount<typeof Account>();
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
  // Selection state - tracks currently selected directory entry (folder or template-ref)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Navigation state for shopping session view
  const [activeSessionTemplateId, setActiveSessionTemplateId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Navigation state for template editing view
  const [activeEditTemplateId, setActiveEditTemplateId] = useState<string | null>(null);

  // Compute parent path for import based on selected folder (must be before early return)
  const importParentPath = useMemo(() => {
    if (!me || !selectedEntryId) return undefined;

    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
    const entries = directoryService.getAllDirectoryEntries(me as any);
    const selectedEntry = entries.find((e) => e.id === selectedEntryId);

    // Only use folder paths (not template-refs)
    if (selectedEntry?.type === 'folder') {
      return selectedEntry.path;
    }

    return undefined;
  }, [selectedEntryId, me]);

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
      />
    );
  }

  // Otherwise render classic UI below
  const templates = me.root?.templates || [];

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!me.root) return;

    // Determine parent path based on selected entry
    let parentPath: string | undefined;
    if (selectedEntryId) {
      // Find the directory entry for the selected entry
      // @ts-expect-error Jazz v0.18.x TypeScript inference issue with Account root type
      const entries = directoryService.getAllDirectoryEntries(me);
      const selectedEntry = entries.find((e) => e.id === selectedEntryId);
      if (selectedEntry) {
        if (selectedEntry.type === 'folder') {
          // If selected entry is a folder, create inside it
          parentPath = selectedEntry.path;
        } else {
          // If selected entry is a template-ref, create at the same level (sibling)
          const pathParts = selectedEntry.path.split(PATH_SEPARATOR);
          parentPath = pathParts.slice(0, -1).join(PATH_SEPARATOR) || undefined;
        }
      }
    }

    // Create directory entry (folder or template-ref)
    // @ts-expect-error Jazz v0.18.x TypeScript inference issue with Account root type
    directoryService.createDirectoryEntry(me, name, isTemplate, parentPath);
  };

  const handleUseTemplate = () => {
    if (!selectedTemplateId) return;

    // Find the template's directory entry to get its path
    // @ts-expect-error Jazz v0.18.x TypeScript inference issue with Account root type
    const entries = directoryService.getAllDirectoryEntries(me);
    const templateEntry = entries.find(
      (e) => e.type === 'template-ref' && e.templateId === selectedTemplateId,
    );

    // Expand the template and its ancestors so it's visible when returning
    if (templateEntry) {
      // @ts-expect-error Jazz v0.18.x TypeScript inference issue with Account root type
      directoryService.expandPathAndAncestors(me, templateEntry.path);
    }

    // Create session using service
    // @ts-expect-error Jazz v0.18.x TypeScript inference issue with Account root type
    const sessionId = SessionService.createSession(me, selectedTemplateId);

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

  const handleBackFromEdit = () => {
    setActiveEditTemplateId(null);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleEntrySelect = (entryId: string) => {
    setSelectedEntryId(entryId);
  };

  const handleHeaderClick = () => {
    // Clicking on BubbleList header deselects everything
    setSelectedTemplateId(null);
    setSelectedEntryId(null);
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
        />
      );
    }
  }

  // Otherwise show Template Editor
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const accountAsAny = me as any;
  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <TreeView
          account={accountAsAny}
          selectedTemplateId={selectedTemplateId}
          selectedEntryId={selectedEntryId}
          onTemplateSelect={handleTemplateSelect}
          onEntrySelect={handleEntrySelect}
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
          onSwitchToSimplified={() => onViewModeChange('simplified')}
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
          parentPath={importParentPath}
        />

        {/* Session Export Dialog */}
        {sessionExportData &&
          (() => {
            const template = templates.find((t) => t?.$jazz.id === sessionExportData.templateId);
            const session = template?.sessions?.find(
              (s) => s?.$jazz.id === sessionExportData.sessionId,
            );
            if (template && session) {
              // Generate session name from createdAt
              const sessionName = session.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
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
