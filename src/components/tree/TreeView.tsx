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
import type { Account, DirectoryEntry, Template } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as templateService from '@/services/templateService';
import { FolderNodeView } from './FolderNodeView';
import { SessionRowView } from './SessionRowView';
import { TreeViewHeader } from './TreeViewHeader';

// Tree structure built from directory entries
interface DirectoryNode {
  entry: DirectoryEntry;
  template?: InstanceOfSchema<typeof Template>;
  children: DirectoryNode[];
  level: number;
}

interface TreeViewProps {
  account: InstanceOfSchema<typeof Account>;
  selectedTemplateId?: string | null;
  onTemplateSelect?: (templateId: string) => void;
  onAddItem?: (parentTemplateId: string) => void;
  onUseTemplate?: (templateId: string) => void;
  onEditTemplate?: (templateId: string) => void;
  onOpenSession?: (templateId: string, sessionId: string) => void;
  onExportSession?: (templateId: string, sessionId: string) => void;
  // Header action handlers
  onHeaderClick?: () => void;
  onAddFolder?: () => void;
  onAddTemplate?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onSignOut?: () => void;
}

/**
 * Build hierarchical tree from flat directory entries
 */
function buildDirectoryTree(account: InstanceOfSchema<typeof Account>): DirectoryNode[] {
  const entries = directoryService.getAllDirectoryEntries(account);
  const nodeMap = new Map<string, DirectoryNode>();
  const rootNodes: DirectoryNode[] = [];

  // Create nodes for all entries
  for (const entry of entries) {
    const template =
      entry.type === 'template-ref' && entry.templateId
        ? templateService.getTemplate(account, entry.templateId)
        : undefined;

    const node: DirectoryNode = {
      entry,
      template: template || undefined,
      children: [],
      level: 0,
    };
    nodeMap.set(entry.id, node);
  }

  // Build tree structure using paths
  for (const node of nodeMap.values()) {
    const pathParts = node.entry.path.split('/');
    if (pathParts.length === 1) {
      // Root level
      rootNodes.push(node);
    } else {
      // Find parent by path
      const parentPath = pathParts.slice(0, -1).join('/');
      const parentEntry = entries.find((e) => e.path === parentPath);
      if (parentEntry) {
        const parentNode = nodeMap.get(parentEntry.id);
        if (parentNode) {
          node.level = parentNode.level + 1;
          parentNode.children.push(node);
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      } else {
        // Parent not found, treat as root
        rootNodes.push(node);
      }
    }
  }

  // Sort children by name
  const sortNodes = (nodes: DirectoryNode[]) => {
    nodes.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };
  sortNodes(rootNodes);

  return rootNodes;
}

export function TreeView({
  account,
  selectedTemplateId,
  onTemplateSelect,
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
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
  );

  const handleToggleEntryExpand = (entryId: string) => {
    directoryService.toggleEntryExpanded(account, entryId);
  };

  const handleRenameEntry = (entryId: string, newName: string) => {
    directoryService.renameDirectoryEntry(account, entryId, newName);
  };

  const handleDeleteEntry = (entryId: string) => {
    directoryService.archiveDirectoryEntry(account, entryId);
  };

  const handleDeleteSession = (templateId: string, sessionId: string) => {
    const template = account.root?.templates?.find((t) => t?.$jazz.id === templateId);
    if (template?.sessions) {
      const session = template.sessions.find((s) => s?.$jazz.id === sessionId);
      if (session) {
        // Soft delete by setting status to abandoned
        session.$jazz.set('status', 'abandoned');
        session.$jazz.set('lastActivityAt', new Date());
      }
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const entryId = event.active.data.current?.entryId as string;
    setActiveEntryId(entryId);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveEntryId(null);

    if (!over || !active.data.current) {
      return;
    }

    const draggedEntryId = active.data.current.entryId as string;
    const overData = over.data.current;

    // Determine the new parent path
    let newParentPath: string | undefined;

    // IMPORTANT: Check virtual root zone FIRST
    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParentPath = undefined; // Move to root level
    } else if (overData?.isFolder) {
      // Dropped on a folder - move inside it
      newParentPath = overData.path as string;
    } else if (overData?.entryId) {
      // Dropped on another entry - move to same parent
      const targetEntry = directoryService.getDirectoryEntry(account, overData.entryId as string);
      if (targetEntry) {
        const pathParts = targetEntry.path.split('/');
        newParentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;
      }
    } else {
      // No valid drop target
      return;
    }

    try {
      directoryService.moveDirectoryEntry(account, draggedEntryId, newParentPath);
    } catch {
      // Silently ignore expected validation errors (moving into self, naming conflicts)
    }
  };

  const handleDragCancel = () => {
    setActiveEntryId(null);
  };

  // Build hierarchical tree structure from directory entries
  const directoryTree = useMemo(() => buildDirectoryTree(account), [account]);

  const renderNode = (node: DirectoryNode): React.ReactNode => {
    const { entry, template, children } = node;
    const isTemplateRef = entry.type === 'template-ref';

    // For template-refs, show sessions
    let sessionChildren: React.ReactNode[] = [];
    if (isTemplateRef && template) {
      const sessions = template.sessions || [];
      const activeSessions = sessions
        .filter((s) => {
          if (!s || s.status === 'abandoned') return false;
          if (!showArchived && s.archived) return false;
          return true;
        })
        .sort((a, b) => {
          const dateA = a?.startedAt?.getTime() || 0;
          const dateB = b?.startedAt?.getTime() || 0;
          return dateB - dateA;
        });

      sessionChildren = activeSessions.map((session) => (
        <SessionRowView
          key={session.$jazz.id}
          session={session}
          templateName={template.name}
          level={node.level + 1}
          onOpen={(sessionId) => {
            onOpenSession?.(template.$jazz.id, sessionId);
          }}
          onDelete={(sessionId) => handleDeleteSession(template.$jazz.id, sessionId)}
          onExport={(sessionId) => onExportSession?.(template.$jazz.id, sessionId)}
          allSessions={activeSessions}
        />
      ));
    }

    const hasChildren = children.length > 0 || sessionChildren.length > 0;

    return (
      <FolderNodeView
        key={entry.id}
        entry={entry}
        template={template}
        level={node.level}
        hasChildren={hasChildren}
        isSelected={isTemplateRef && selectedTemplateId === template?.$jazz.id}
        onSelect={
          isTemplateRef && template ? () => onTemplateSelect?.(template.$jazz.id) : undefined
        }
        onToggleExpand={() => handleToggleEntryExpand(entry.id)}
        onRename={handleRenameEntry}
        onDelete={handleDeleteEntry}
        onUseTemplate={
          isTemplateRef && template ? () => onUseTemplate?.(template.$jazz.id) : undefined
        }
        onEditTemplate={
          isTemplateRef && template ? () => onEditTemplate?.(template.$jazz.id) : undefined
        }
        account={account}
      >
        {/* Render children only when expanded */}
        {entry.expanded && (
          <>
            {/* Render sessions for template-refs */}
            {sessionChildren}
            {/* Render child entries recursively */}
            {children.map((childNode) => renderNode(childNode))}
          </>
        )}
      </FolderNodeView>
    );
  };

  // Determine button states
  const selectedTemplate = selectedTemplateId
    ? account.root?.templates?.find((t) => t?.$jazz.id === selectedTemplateId)
    : null;
  const canEditOrUse = !!selectedTemplate;

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
          isDragging={!!activeEntryId}
          canCreateFolderOrList={true}
          canEditOrUse={canEditOrUse}
          showArchived={showArchived}
          onHeaderClick={onHeaderClick || (() => {})}
          onEditTemplate={() => {
            if (selectedTemplateId && onEditTemplate) {
              onEditTemplate(selectedTemplateId);
            }
          }}
          onUseTemplate={() => {
            if (selectedTemplateId && onUseTemplate) {
              onUseTemplate(selectedTemplateId);
            }
          }}
          onAddFolder={onAddFolder || (() => {})}
          onAddTemplate={onAddTemplate || (() => {})}
          onExport={onExport || (() => {})}
          onImport={onImport || (() => {})}
          onToggleShowArchived={() => setShowArchived(!showArchived)}
          onSignOut={onSignOut}
        />

        {directoryTree.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No lists yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 p-2">
            {directoryTree.map((node) => renderNode(node))}
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeEntryId ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            {(() => {
              const entry = directoryService.getDirectoryEntry(account, activeEntryId);
              return <span className="font-medium">{entry?.name || ''}</span>;
            })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
