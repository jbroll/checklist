import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo } from 'react';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import { buildTreeStructure, type TreeNode } from '@/utils/treeHelpers';
import { FolderNodeView } from './FolderNodeView';
import { SessionRowView } from './SessionRowView';

interface TreeViewProps {
  nodes: readonly (InstanceOfSchema<typeof FolderNode> | null)[];
  account: InstanceOfSchema<typeof GroceriesAccount>;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
  onAddItem?: (parentNodeId: string) => void;
  onUseTemplate?: (nodeId: string) => void;
  onEditTemplate?: (nodeId: string) => void;
  onOpenSession?: (folderId: string, sessionId: string) => void;
}

export function TreeView({
  nodes,
  account,
  selectedNodeId,
  onNodeSelect,
  onAddItem: _onAddItem,
  onUseTemplate,
  onEditTemplate,
  onOpenSession,
}: TreeViewProps) {
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

  const handleDeleteSession = (nodeId: string, sessionId: string) => {
    const node = nodes.find((n) => n?.$jazz.id === nodeId);
    if (node?.sessions) {
      const session = node.sessions.find((s) => s?.$jazz.id === sessionId);
      if (session) {
        // Soft delete by setting status to abandoned
        session.$jazz.set('status', 'abandoned');
        session.$jazz.set('lastActivityAt', new Date());
      }
    }
  };

  // Build hierarchical tree structure from flat node list
  const treeStructure = useMemo(() => buildTreeStructure(nodes), [nodes]);

  const renderTreeNode = (treeNode: TreeNode, level = 0): React.ReactNode => {
    const { node, children } = treeNode;

    // Show sessions under template folders
    const sessions = node.sessions || [];
    const activeSessions = sessions.filter((s) => s && s.status !== 'abandoned');

    // A node has children if it has child folders/templates OR sessions
    const hasChildren = children.length > 0 || activeSessions.length > 0;

    return (
      <FolderNodeView
        key={node.$jazz.id}
        node={node}
        level={level}
        hasChildren={hasChildren}
        isSelected={selectedNodeId === node.$jazz.id}
        onSelect={onNodeSelect}
        onToggleExpand={() => handleToggleExpand(node)}
        onRename={handleRenameNode}
        onDelete={handleDeleteNode}
        onUseTemplate={onUseTemplate}
        onEditTemplate={onEditTemplate}
        account={account}
      >
        {/* Render children only when expanded */}
        {node.expanded && (
          <>
            {/* Render sessions for template folders */}
            {activeSessions.map((session) => (
              <SessionRowView
                key={session.$jazz.id}
                session={session}
                level={level + 1}
                onOpen={(sessionId) => onOpenSession?.(node.$jazz.id, sessionId)}
                onDelete={(sessionId) => handleDeleteSession(node.$jazz.id, sessionId)}
              />
            ))}
            {/* Render child folders/templates recursively */}
            {children.map((childNode) => renderTreeNode(childNode, level + 1))}
          </>
        )}
      </FolderNodeView>
    );
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      {treeStructure.length === 0 ? (
        <div className="p-8 text-center text-neutral-500">
          <p>No lists yet.</p>
          <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
        </div>
      ) : (
        <div className="p-2">{treeStructure.map((treeNode) => renderTreeNode(treeNode))}</div>
      )}
    </div>
  );
}
