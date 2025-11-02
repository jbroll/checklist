import type { InstanceOfSchema } from 'jazz-tools';
import { Plus } from 'lucide-react';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import { FolderNodeView } from './FolderNodeView';
import { TemplateItemView } from './TemplateItemView';

interface TreeViewProps {
  nodes: readonly (InstanceOfSchema<typeof FolderNode> | null)[];
  account: InstanceOfSchema<typeof GroceriesAccount>;
  onAddFolder?: () => void;
  onAddItem?: (parentNodeId: string) => void;
}

export function TreeView({ nodes, account, onAddFolder, onAddItem: _onAddItem }: TreeViewProps) {
  const handleToggleExpand = (node: InstanceOfSchema<typeof FolderNode>) => {
    node.$jazz.set('expanded', !node.expanded);
    node.$jazz.set('updatedAt', new Date());
  };

  const handleRenameNode = (nodeId: string, newName: string) => {
    const node = nodes.find((n) => n?.$jazz.id === nodeId);
    if (node) {
      node.$jazz.set('name', newName);
      node.$jazz.set('updatedAt', new Date());
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    const node = nodes.find((n) => n?.$jazz.id === nodeId);
    if (node) {
      node.$jazz.set('archived', true);
      node.$jazz.set('updatedAt', new Date());
    }
  };

  const handleRenameItem = (nodeId: string, itemId: string, newName: string) => {
    const node = nodes.find((n) => n?.$jazz.id === nodeId);
    if (node) {
      const item = node.items?.find((i) => i?.$jazz.id === itemId);
      if (item) {
        item.$jazz.set('name', newName);
        item.$jazz.set('updatedAt', new Date());
      }
    }
  };

  const handleDeleteItem = (nodeId: string, itemId: string) => {
    const node = nodes.find((n) => n?.$jazz.id === nodeId);
    if (node) {
      const item = node.items?.find((i) => i?.$jazz.id === itemId);
      if (item) {
        item.$jazz.set('archived', true);
        item.$jazz.set('updatedAt', new Date());
      }
    }
  };

  const handleAddToSession = (itemId: string) => {
    // TODO: Implement in Phase 4
    console.log('Add to session:', itemId);
  };

  const renderNode = (node: InstanceOfSchema<typeof FolderNode>, level = 0): React.ReactNode => {
    if (!node || node.archived) return null;

    const items = node.items || [];
    const activeItems = items.filter((item) => item && !item.archived);

    return (
      <FolderNodeView
        key={node.$jazz.id}
        node={node}
        level={level}
        onToggleExpand={() => handleToggleExpand(node)}
        onRename={handleRenameNode}
        onDelete={handleDeleteNode}
        account={account}
      >
        {activeItems.map((item) => (
          <TemplateItemView
            key={item.$jazz.id}
            item={item}
            level={level + 1}
            onRename={(itemId, newName) => handleRenameItem(node.$jazz.id, itemId, newName)}
            onDelete={(itemId) => handleDeleteItem(node.$jazz.id, itemId)}
            onAddToSession={handleAddToSession}
          />
        ))}
      </FolderNodeView>
    );
  };

  const activeNodes = nodes.filter((node) => node && !node.archived);

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Templates</h2>
        {onAddFolder && (
          <button
            type="button"
            onClick={onAddFolder}
            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            New Folder
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="rounded-lg border border-neutral-200 bg-white">
        {activeNodes.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No templates yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your template items.</p>
          </div>
        ) : (
          <div className="p-2">{activeNodes.map((node) => node && renderNode(node))}</div>
        )}
      </div>
    </div>
  );
}
