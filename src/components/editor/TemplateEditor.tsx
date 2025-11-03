import { Download, LogOut, MoreVertical, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { ShoppingSessionView } from '@/components/session/ShoppingSessionView';
import { TreeView } from '@/components/tree';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/jazz';
import type { GroceriesAccount } from '@/schemas';
import * as FolderService from '@/services/folderService';
import * as SessionService from '@/services/sessionService';
import { AddFolderDialog } from './AddFolderDialog';
import { TemplateItemsView } from './TemplateItemsView';

interface TemplateEditorProps {
  onSignOut?: () => void;
}

export function TemplateEditor({ onSignOut }: TemplateEditorProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

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

  const selectedNode = selectedNodeId ? nodes.find((n) => n?.$jazz.id === selectedNodeId) : null;
  const isTemplate = selectedNode?.type === 'template-folder';
  const isFolder = selectedNode?.type === 'folder';

  // Button enabling logic
  // New Folder/New List: enabled when nothing selected OR when a folder (not template) is selected
  const canCreateFolderOrList = !selectedNodeId || isFolder;
  // Edit List/Use List: enabled only when a template is selected
  const canEditOrUse = selectedNodeId && isTemplate;

  // If editing a template, show TemplateItemsView
  if (activeEditFolderId) {
    const editFolder = nodes.find((n) => n?.$jazz.id === activeEditFolderId);
    if (editFolder) {
      return (
        <TemplateItemsView
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          folder={editFolder}
          onBack={handleBackFromEdit}
        />
      );
    }
  }

  // If viewing a shopping session, show ShoppingSessionView
  if (activeSessionFolderId && activeSessionId) {
    const sessionFolder = nodes.find((n) => n?.$jazz.id === activeSessionFolderId);
    if (sessionFolder) {
      return (
        <ShoppingSessionView
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
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleHeaderClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <BubbleListIcon className="h-8 w-8" size={32} />
            <h1 className="text-3xl font-bold text-neutral-900">BubbleList</h1>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEditTemplate}
              disabled={!canEditOrUse}
              className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Edit List
            </button>
            <button
              type="button"
              onClick={handleUseTemplate}
              disabled={!canEditOrUse}
              className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              Use List
            </button>
            <button
              type="button"
              onClick={() => setShowAddFolder(true)}
              disabled={!canCreateFolderOrList}
              className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              <Plus className="h-4 w-4" />
              New Folder
            </button>
            <button
              type="button"
              onClick={() => setShowAddTemplate(true)}
              disabled={!canCreateFolderOrList}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-600"
            >
              <Plus className="h-4 w-4" />
              New List
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                  aria-label="More options"
                >
                  <MoreVertical className="h-5 w-5 text-neutral-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </DropdownMenuItem>
                {onSignOut && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

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
      </div>
    </div>
  );
}
