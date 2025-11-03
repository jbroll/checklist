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
import type { Category, GroceriesAccount } from '@/schemas';
import * as FolderService from '@/services/folderService';
import * as ItemService from '@/services/itemService';
import * as SessionService from '@/services/sessionService';
import { AddFolderDialog } from './AddFolderDialog';
import { AddItemDialog } from './AddItemDialog';

interface TemplateEditorProps {
  onSignOut?: () => void;
}

export function TemplateEditor({ onSignOut }: TemplateEditorProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Navigation state for shopping session view
  const [activeSessionFolderId, setActiveSessionFolderId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

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

    // Use folder service to create folder with proper Jazz CoList mutation
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    FolderService.createFolder(me, name, isTemplate);
  };

  const handleAddItem = (name: string, category: Category, defaultQuantity?: string) => {
    if (!selectedFolderId) return;

    // Use item service to create item with proper Jazz CoList mutation
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createItem(me, selectedFolderId, name, category, defaultQuantity);
  };

  const handleOpenAddItem = (folderId: string) => {
    setSelectedFolderId(folderId);
    setShowAddItem(true);
  };

  const handleUseTemplate = (folderId: string) => {
    // Create session using service
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    const sessionId = SessionService.createSession(me, folderId);

    // Navigate to shopping session view
    setActiveSessionFolderId(folderId);
    setActiveSessionId(sessionId);
  };

  const handleEditTemplate = (folderId: string) => {
    // Expand the folder to show sessions and allow editing
    const folder = nodes.find((n) => n?.$jazz.id === folderId);
    if (folder) {
      folder.$jazz.set('expanded', true);
      folder.$jazz.set('updatedAt', new Date());
    }
  };

  const handleBackToTemplates = () => {
    setActiveSessionFolderId(null);
    setActiveSessionId(null);
  };

  const selectedFolder = selectedFolderId
    ? nodes.find((n) => n?.$jazz.id === selectedFolderId)
    : null;

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
          <div className="flex items-center gap-3">
            <BubbleListIcon className="h-8 w-8" size={32} />
            <h1 className="text-3xl font-bold text-neutral-900">BubbleList</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddFolder(true)}
              className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50"
            >
              <Plus className="h-4 w-4" />
              New Folder
            </button>
            <button
              type="button"
              onClick={() => setShowAddTemplate(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
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
          onAddItem={handleOpenAddItem}
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

        <AddItemDialog
          open={showAddItem}
          onOpenChange={setShowAddItem}
          onAdd={handleAddItem}
          folderName={selectedFolder?.name ?? ''}
        />

        {/* @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists */}
        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} account={me} />

        {/* @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists */}
        <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} account={me} />
      </div>
    </div>
  );
}
