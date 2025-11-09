import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo, useState } from 'react';
import type { Account, FolderNode } from '@/schemas';
import { moveFolder } from '@/services/folderService';
import { getParentPath } from '@/utils/pathUtils';
import { buildTreeStructure, type TreeNode } from '@/utils/treeHelpers';
import { FolderNodeView } from './FolderNodeView';
import { SessionRowView } from './SessionRowView';
import { TreeViewHeader } from './TreeViewHeader';

interface TreeViewProps {
  nodes: readonly (InstanceOfSchema<typeof FolderNode> | null)[];
  account: InstanceOfSchema<typeof Account>;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
  onAddItem?: (parentNodeId: string) => void;
  onUseTemplate?: (nodeId: string) => void;
  onEditTemplate?: (nodeId: string) => void;
  onOpenSession?: (folderId: string, sessionId: string) => void;
  onExportSession?: (folderId: string, sessionId: string) => void;
  // Header action handlers
  onHeaderClick?: () => void;
  onAddFolder?: () => void;
  onAddTemplate?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onSignOut?: () => void;
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
  onExportSession,
  onHeaderClick,
  onAddFolder,
  onAddTemplate,
  onExport,
  onImport,
  onSignOut,
}: TreeViewProps) {
  const [activeNode, setActiveNode] = useState<InstanceOfSchema<typeof FolderNode> | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
  );

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

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const draggedNode = event.active.data.current?.node as InstanceOfSchema<typeof FolderNode>;
    console.log('🎯 DRAG START:', {
      name: draggedNode?.name,
      type: draggedNode?.type,
      path: draggedNode?.path,
      id: draggedNode?.$jazz.id,
    });
    setActiveNode(draggedNode);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    console.log('\n🏁 DRAG END:', {
      hasOver: !!over,
      hasActiveData: !!active.data.current,
      overId: over?.id,
    });

    setActiveNode(null);

    if (!over || !active.data.current) {
      console.log('❌ No valid drop target');
      return;
    }

    const draggedNode = active.data.current.node as InstanceOfSchema<typeof FolderNode>;
    const overData = over.data.current;

    console.log('📦 Drop details:', {
      draggedName: draggedNode?.name,
      draggedPath: draggedNode?.path,
      draggedType: draggedNode?.type,
      overData: overData,
    });

    // CRITICAL: Check if we're dropping on a template node - reject immediately
    // Templates are leaf nodes and cannot accept drops or affect positioning
    const overNode = overData?.node as InstanceOfSchema<typeof FolderNode> | undefined;
    if (overNode?.type === 'template-folder') {
      // Ignore all drops on template nodes - they are leaf nodes
      console.log('🚫 Drop on template ignored - templates cannot contain children', {
        draggedNode: draggedNode.name,
        targetTemplate: overNode.name,
      });
      return;
    }

    // CRITICAL: Check if we're dropping a folder onto itself - reject immediately
    if (overNode && draggedNode.$jazz.id === overNode.$jazz.id) {
      console.log('🚫 Cannot drop a folder onto itself', {
        folderName: draggedNode.name,
      });
      return;
    }

    console.log('✅ Validations passed, determining new parent path...');

    // Determine the new parent path
    let newParentPath: string | undefined;

    console.log('🔍 Determining target location:', {
      isFolder: overData?.isFolder,
      hasNode: !!overData?.node,
      overPath: overData?.path,
    });

    // IMPORTANT: Check virtual root zone FIRST
    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParentPath = undefined; // Move to root level
      console.log('📍 Dropping into ROOT zone');
    } else if (overData?.isFolder) {
      // Dropped on an organizational folder - move inside it
      newParentPath = overData.path as string;
      console.log(`📂 Dropping INTO folder: "${newParentPath}"`);
    } else if (overData?.node) {
      // Dropped on another node - move to same parent
      const targetNodePath = (overData.node as InstanceOfSchema<typeof FolderNode>).path;
      newParentPath = getParentPath(targetNodePath);
      console.log(
        `📍 Dropping NEXT TO node at path "${targetNodePath}" → parent: "${newParentPath || '<ROOT>'}"`,
      );
    } else {
      // No valid drop target
      console.log('❌ No valid drop target data');
      return;
    }

    // Don't move if dropped on same location
    const currentParentPath = getParentPath(draggedNode.path);
    console.log('📍 Location check:', {
      currentParent: currentParentPath || '<ROOT>',
      newParent: newParentPath || '<ROOT>',
      isSameLocation: newParentPath === currentParentPath,
    });

    if (newParentPath === currentParentPath) {
      console.log('⏭️  Already in this location, skipping');
      return;
    }

    console.log('🚀 Calling moveFolder...\n');
    try {
      moveFolder(account, draggedNode, newParentPath);
      console.log('✅ Move completed successfully\n');
    } catch (error) {
      console.error('❌ Move failed:', error);
      // Silently ignore expected validation errors (moving into self, naming conflicts)
    }
  };

  const handleDragCancel = () => {
    setActiveNode(null);
  };

  // Build hierarchical tree structure from flat node list
  const treeStructure = useMemo(() => buildTreeStructure(nodes), [nodes]);

  const renderTreeNode = (treeNode: TreeNode, level = 0): React.ReactNode => {
    const { node, children } = treeNode;

    // Show sessions under template folders
    const sessions = node.sessions || [];
    const activeSessions = sessions
      .filter((s) => {
        if (!s || s.status === 'abandoned') return false;
        if (!showArchived && s.archived) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort in reverse chronological order (newest first)
        const dateA = a?.startedAt?.getTime() || 0;
        const dateB = b?.startedAt?.getTime() || 0;
        return dateB - dateA;
      });

    // A node has children if it has child folders/templates OR sessions (but NOT template items)
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
                templateName={node.name}
                level={level + 1}
                onOpen={(sessionId) => {
                  // Use the session's templateFolderId, not the current node's ID
                  // Sessions store which template they belong to via templateFolderId
                  const folderId = session.templateFolderId || node.$jazz.id;
                  console.log('🎯 SESSION OPEN - Using templateFolderId', {
                    sessionId,
                    templateFolderId: session.templateFolderId,
                    currentNodeId: node.$jazz.id,
                    currentNodeName: node.name,
                    usingFolderId: folderId,
                  });
                  onOpenSession?.(folderId, sessionId);
                }}
                onDelete={(sessionId) => handleDeleteSession(node.$jazz.id, sessionId)}
                onExport={(sessionId) => onExportSession?.(node.$jazz.id, sessionId)}
                allSessions={activeSessions}
              />
            ))}
            {/* Render child folders/templates recursively */}
            {children.map((childNode) => renderTreeNode(childNode, level + 1))}
          </>
        )}
      </FolderNodeView>
    );
  };

  // Determine button states
  const selectedNode = selectedNodeId ? nodes.find((n) => n?.$jazz.id === selectedNodeId) : null;
  const isTemplate = selectedNode?.type === 'template-folder';
  const isFolder = selectedNode?.type === 'folder';
  const canCreateFolderOrList = !selectedNodeId || isFolder;
  const canEditOrUse = !!(selectedNodeId && isTemplate);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="rounded-lg border border-neutral-200 bg-white">
        {/* Root-level drop zone with header */}
        <TreeViewHeader
          isDragging={!!activeNode}
          canCreateFolderOrList={canCreateFolderOrList}
          canEditOrUse={canEditOrUse}
          showArchived={showArchived}
          onHeaderClick={onHeaderClick || (() => {})}
          onEditTemplate={() => {
            if (selectedNodeId && onEditTemplate) {
              onEditTemplate(selectedNodeId);
            }
          }}
          onUseTemplate={() => {
            if (selectedNodeId && onUseTemplate) {
              onUseTemplate(selectedNodeId);
            }
          }}
          onAddFolder={onAddFolder || (() => {})}
          onAddTemplate={onAddTemplate || (() => {})}
          onExport={onExport || (() => {})}
          onImport={onImport || (() => {})}
          onToggleShowArchived={() => setShowArchived(!showArchived)}
          onSignOut={onSignOut}
        />

        {treeStructure.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No lists yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 p-2">
            {treeStructure.map((treeNode) => renderTreeNode(treeNode))}
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeNode ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{activeNode.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
