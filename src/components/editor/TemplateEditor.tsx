import { useState } from 'react';
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
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

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
        items: [],
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: me },
    );

    // Add to nodes array
    me.root.nodes.push(newFolder);
  };

  const handleAddItem = (name: string, category: Category, defaultQuantity?: string) => {
    if (!selectedFolderId) return;

    const folder = nodes.find((n) => n?.$jazz.id === selectedFolderId);
    if (!folder) return;

    // Create new template item
    const newItem = TemplateItem.create(
      {
        name,
        category,
        defaultQuantity,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: me },
    );

    // Add to folder's items
    if (!folder.items) {
      folder.$jazz.set('items', []);
    }
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

        <TreeView
          nodes={nodes}
          account={me}
          onAddFolder={() => setShowAddFolder(true)}
          onAddItem={handleOpenAddItem}
        />

        <AddFolderDialog
          open={showAddFolder}
          onOpenChange={setShowAddFolder}
          onAdd={handleAddFolder}
        />

        <AddItemDialog
          open={showAddItem}
          onOpenChange={setShowAddItem}
          onAdd={handleAddItem}
          folderName={selectedFolder?.name}
        />
      </div>
    </div>
  );
}
