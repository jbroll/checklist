import { useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { SessionView } from '@/components/session/SessionView';
import { TreeView } from '@/components/tree';
import { useAccount } from '@/lib/jazz';
import type { Account } from '@/schemas';
import * as FolderService from '@/services/folderService';
import * as SessionService from '@/services/sessionService';
import { AddFolderDialog } from './AddFolderDialog';
import { TemplateItemEditor } from './TemplateItemEditor';

interface AppContainerProps {
  onSignOut?: () => void;
}

export function AppContainer({ onSignOut }: AppContainerProps) {
  const { me } = useAccount<typeof Account>();
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSessionExportDialog, setShowSessionExportDialog] = useState(false);
  const [sessionExportData, setSessionExportData] = useState<{
    folderId: string;
    sessionId: string;
  } | null>(null);

  // Selection state - tracks currently selected folder/template
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Navigation state for shopping session view
  const [activeSessionFolderId, setActiveSessionFolderId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Navigation state for template editing view
  const [activeEditFolderId, setActiveEditFolderId] = useState<string | null>(null);

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

  const nodes = me.root?.nodes || [];

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!me.root) return;

    // If a folder is selected, use its path as parent
    const selectedNode = selectedNodeId ? nodes.find((n) => n?.$jazz.id === selectedNodeId) : null;
    const isFolder = selectedNode?.type === 'folder';
    const parentPath = isFolder ? selectedNode?.path : undefined;

    // Use folder service to create folder with proper Jazz CoList mutation
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    FolderService.createFolder(me, name, isTemplate, parentPath);
  };

  const handleUseTemplate = () => {
    if (!selectedNodeId) return;

    // Create session using service
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    const sessionId = SessionService.createSession(me, selectedNodeId);

    // Navigate to shopping session view
    setActiveSessionFolderId(selectedNodeId);
    setActiveSessionId(sessionId);
  };

  const handleEditTemplate = () => {
    if (!selectedNodeId) return;

    // Navigate to template editing view
    setActiveEditFolderId(selectedNodeId);
  };

  const handleBackToTemplates = () => {
    setActiveSessionFolderId(null);
    setActiveSessionId(null);
  };

  const handleBackFromEdit = () => {
    setActiveEditFolderId(null);
  };

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleHeaderClick = () => {
    // Clicking on BubbleList header deselects everything
    setSelectedNodeId(null);
  };

  const handleExportSession = (folderId: string, sessionId: string) => {
    setSessionExportData({ folderId, sessionId });
    setShowSessionExportDialog(true);
  };

  // If editing a template, show TemplateItemEditor
  if (activeEditFolderId) {
    const editFolder = nodes.find((n) => n?.$jazz.id === activeEditFolderId);
    if (editFolder) {
      return (
        <TemplateItemEditor
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          folder={editFolder}
          onBack={handleBackFromEdit}
        />
      );
    }
  }

  // If viewing a shopping session, show SessionView
  if (activeSessionFolderId && activeSessionId) {
    const sessionFolder = nodes.find((n) => n?.$jazz.id === activeSessionFolderId);
    if (sessionFolder) {
      return (
        <SessionView
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          folder={sessionFolder}
          sessionId={activeSessionId}
          onBack={handleBackToTemplates}
        />
      );
    }
  }

  // Otherwise show Template Editor
  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <TreeView
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          nodes={nodes}
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          account={me}
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
          onUseTemplate={handleUseTemplate}
          onEditTemplate={handleEditTemplate}
          onOpenSession={(folderId, sessionId) => {
            setActiveSessionFolderId(folderId);
            setActiveSessionId(sessionId);
          }}
          onExportSession={handleExportSession}
          onHeaderClick={handleHeaderClick}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => setShowAddTemplate(true)}
          onExport={() => setShowExportDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onSignOut={onSignOut}
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

        {/* @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists */}
        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} account={me} />

        {/* @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists */}
        <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} account={me} />

        {/* Session Export Dialog */}
        {sessionExportData &&
          (() => {
            const folder = nodes.find((n) => n?.$jazz.id === sessionExportData.folderId);
            const session = folder?.sessions?.find(
              (s) => s?.$jazz.id === sessionExportData.sessionId,
            );
            if (folder && session) {
              return (
                <SessionExportDialog
                  open={showSessionExportDialog}
                  onOpenChange={setShowSessionExportDialog}
                  // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
                  folder={folder}
                  sessionId={sessionExportData.sessionId}
                  sessionName={session.name}
                  // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
                  account={me}
                />
              );
            }
            return null;
          })()}
      </main>
    </div>
  );
}
