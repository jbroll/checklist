import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/ExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { TreeView } from '@/components/tree';
import { useAccount } from '@/lib/jazz';
import { type Category, FolderNode, type GroceriesAccount, TemplateItem } from '@/schemas';
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

    // Create new folder node using Jazz's create method
    const newFolder = FolderNode.create(
      {
        name,
        type: isTemplate ? 'template-folder' : 'folder',
        path: `/${name}`,
        expanded: true,
        archived: false, // Start unarchived
        // Always initialize items and sessions as empty arrays
        items: [],
        sessions: [],
        currentSessionId: '', // Empty string for no current session
        owner: me,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: me },
    );

    // Add to nodes array
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    me.root.nodes.push(newFolder);
  };

  const handleAddItem = (name: string, category: Category, defaultQuantity?: string) => {
    if (!selectedFolderId) return;

    const folder = nodes.find((n) => n?.$jazz.id === selectedFolderId);
    if (!folder || !folder.items) return;

    // Create new template item
    const newItem = TemplateItem.create(
      {
        name,
        category,
        sortOrder: folder.items.length,
        archived: false,
        defaultQuantity: defaultQuantity || '', // Use empty string if not provided
        addedBy: me,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: me },
    );

    // Add to folder's items
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    folder.items.push(newItem);
    folder.$jazz.set('updatedAt', new Date());
  };

  const handleOpenAddItem = (folderId: string) => {
    setSelectedFolderId(folderId);
    setShowAddItem(true);
  };

  const selectedFolder = selectedFolderId
    ? nodes.find((n) => n?.$jazz.id === selectedFolderId)
    : null;

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Template Editor</h1>
            <p className="mt-2 text-neutral-600">
              Organize your frequently purchased items into reusable templates.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowExportDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        <TreeView
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          nodes={nodes}
          // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
          account={me}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => setShowAddTemplate(true)}
          onAddItem={handleOpenAddItem}
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
          title="New Template"
          description="Create a new template folder for frequently purchased items."
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
