import type { InstanceOfSchema } from 'jazz-tools';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import { useAccount } from '@/lib/jazz';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import * as ItemService from '@/services/itemService';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { AddItemDialog } from './AddItemDialog';

interface TemplateItemsViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  onBack: () => void;
}

export function TemplateItemsView({ folder, onBack }: TemplateItemsViewProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [showAddDialog, setShowAddDialog] = useState(false);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  const items = folder.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Build hierarchical tree structure
  const itemTree = buildItemTree(activeItems);

  const handleAddItem = (
    name: string,
    parentPath?: string,
    defaultQuantity?: string,
    icon?: string,
  ) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createItem(me, folder.$jazz.id, name, parentPath, defaultQuantity, icon);
  };

  const handleAddCategory = (name: string, parentPath?: string, icon?: string, color?: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.createCategory(me, folder.$jazz.id, name, parentPath, icon, color);
  };

  const handleRenameItem = (itemId: string, newName: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.renameItem(me, folder.$jazz.id, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    ItemService.archiveItem(me, folder.$jazz.id, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i?.$jazz.id === itemId);
    if (item && item.type === 'category') {
      item.$jazz.set('expanded', !item.expanded);
    }
  };

  // Recursive function to render item tree
  const renderItemNode = (node: ReturnType<typeof buildItemTree>[number], depth = 0) => {
    const { item, children } = node;

    return (
      <div key={item.$jazz.id}>
        <TemplateItemView
          item={item}
          level={depth}
          hasChildren={children.length > 0}
          onRename={handleRenameItem}
          onDelete={handleDeleteItem}
          onToggleExpand={handleToggleExpand}
        />
        {/* Render children if category is expanded */}
        {item.type === 'category' && item.expanded && children.length > 0 && (
          <div>{children.map((child) => renderItemNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-neutral-600" />
            </button>
            <h1 className="text-3xl font-bold text-neutral-900">{folder.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
        </div>

        {/* Items Tree */}
        <div className="rounded-lg border border-neutral-200 bg-white">
          {itemTree.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              <p>No items in this list yet.</p>
              <p className="mt-1 text-sm">Click "Add Item" to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {itemTree.map((node) => renderItemNode(node, 0))}
            </div>
          )}
        </div>

        {/* Add Item Dialog */}
        <AddItemDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onAddItem={handleAddItem}
          onAddCategory={handleAddCategory}
          folderName={folder.name}
          categories={activeItems}
        />
      </div>
    </div>
  );
}
