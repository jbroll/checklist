import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { useEffect, useMemo, useState } from 'react';
import type { Account, FolderNode, SessionData } from '@/schemas';
import * as folderService from '@/services/folderService';
import * as sessionService from '@/services/sessionService';
import { FolderNodeView } from './FolderNodeView';
import { ReorderDropZone } from './ReorderDropZone';
import { SessionRowView } from './SessionRowView';
import { TreeViewHeader } from './TreeViewHeader';

// Tree structure for rendering
interface TreeNode {
  folder: InstanceOfSchema<typeof FolderNode>;
  children: TreeNode[];
  level: number;
}

interface TreeViewProps {
  account: InstanceOfSchema<typeof Account>;
  selectedTemplateId?: string | null;
  selectedFolderId?: string | null; // Changed from selectedEntryId
  onTemplateSelect?: (templateId: string) => void;
  onFolderSelect?: (folderId: string) => void; // Changed from onEntrySelect
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
  onSignIn?: () => void;
  isAuthenticated?: boolean;
  onSwitchToSimplified?: () => void;
  switchViewLabel?: string;
  // Session display control
  sessionsEnabled?: boolean;
  hideArchivedTemplatesToggle?: boolean;
  hideArchivedSessionsToggle?: boolean;
  hideArchiveAction?: boolean;
}

/**
 * Build hierarchical tree from FolderNode structure
 */
function buildFolderTree(
  folders: InstanceOfSchema<typeof FolderNode>[],
  showArchived: boolean,
  level = 0,
): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (const folder of folders) {
    if (!folder) continue;
    if (!showArchived && folder.archived) continue;

    const children = folder.children
      ? buildFolderTree(folder.children, showArchived, level + 1)
      : [];

    nodes.push({
      folder,
      children,
      level,
    });
  }

  return nodes;
}

export function TreeView({
  account,
  selectedTemplateId,
  selectedFolderId,
  onTemplateSelect,
  onFolderSelect,
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
  onSignIn,
  isAuthenticated,
  onSwitchToSimplified,
  switchViewLabel,
  sessionsEnabled = true,
  hideArchivedTemplatesToggle = false,
  hideArchivedSessionsToggle = false,
  hideArchiveAction = false,
}: TreeViewProps) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(() => {
    const stored = localStorage.getItem('bubblelist-show-archived-templates');
    return stored === 'true';
  });
  const [showArchivedSessions, setShowArchivedSessions] = useState(() => {
    const stored = localStorage.getItem('bubblelist-show-archived-sessions');
    return stored === 'true';
  });

  // Persist archived view preferences
  useEffect(() => {
    localStorage.setItem('bubblelist-show-archived-templates', String(showArchivedTemplates));
  }, [showArchivedTemplates]);

  useEffect(() => {
    localStorage.setItem('bubblelist-show-archived-sessions', String(showArchivedSessions));
  }, [showArchivedSessions]);

  // Get selected folder by ID
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId || !account.root?.folders) return null;

    const findFolder = (
      folders: typeof account.root.folders,
    ): InstanceOfSchema<typeof FolderNode> | null => {
      for (const f of folders) {
        if (!f) continue;
        if (f.$jazz.id === selectedFolderId) return f;
        if (f.children) {
          const found = findFolder(f.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findFolder(account.root.folders);
  }, [selectedFolderId, account.root?.folders]);

  // Clear selection when selected folder becomes archived
  useEffect(() => {
    if (selectedFolder?.archived && !showArchivedTemplates) {
      onHeaderClick?.();
    }
  }, [selectedFolder, showArchivedTemplates, onHeaderClick]);

  // Configure sensors for drag detection
  // Use MouseSensor + TouchSensor instead of PointerSensor for proper mobile support
  // TouchSensor allows scrolling while supporting drag gestures
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms hold before drag starts (allows scrolling)
        tolerance: 8, // Allow 8px of movement during the delay
      },
    }),
  );

  const handleToggleFolderExpand = (folder: InstanceOfSchema<typeof FolderNode>) => {
    folderService.toggleFolderExpanded(folder);
  };

  const handleRenameFolder = (folder: InstanceOfSchema<typeof FolderNode>, newName: string) => {
    folderService.renameFolder(folder, newName);
  };

  const handleToggleArchiveFolder = (folder: InstanceOfSchema<typeof FolderNode>) => {
    if (folder.archived) {
      folderService.unarchiveFolder(folder);
    } else {
      folderService.archiveFolder(folder);
    }
  };

  const handleDeleteFolder = (folder: InstanceOfSchema<typeof FolderNode>) => {
    folderService.deleteFolder(account, folder);
  };

  const handleToggleArchiveSession = (
    templateFolder: InstanceOfSchema<typeof FolderNode>,
    sessionId: string,
  ) => {
    const sessions = templateFolder.sessions
      ? Array.isArray(templateFolder.sessions)
        ? templateFolder.sessions
        : // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x sessions may be CoList or array
          Array.from(templateFolder.sessions as any)
      : [];
    const session = sessions.find((s: SessionData) => s?.id === sessionId);
    if (session) {
      if (session.archived) {
        sessionService.unarchiveSession(account, templateFolder.$jazz.id, sessionId);
      } else {
        sessionService.archiveSession(account, templateFolder.$jazz.id, sessionId);
      }
    }
  };

  const handleDeleteSession = (
    templateFolder: InstanceOfSchema<typeof FolderNode>,
    sessionId: string,
  ) => {
    sessionService.deleteSession(account, templateFolder.$jazz.id, sessionId);
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const folderId = event.active.data.current?.folderId as string;
    setActiveFolderId(folderId);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveFolderId(null);

    if (!over || !active.data.current || !account.root?.folders) {
      return;
    }

    const draggedFolderId = active.data.current.folderId as string;
    const overData = over.data.current;

    // Find dragged folder
    const findFolder = (
      folders: typeof account.root.folders,
    ): InstanceOfSchema<typeof FolderNode> | null => {
      for (const f of folders) {
        if (!f) continue;
        if (f.$jazz.id === draggedFolderId) return f;
        if (f.children) {
          const found = findFolder(f.children);
          if (found) return found;
        }
      }
      return null;
    };

    const draggedFolder = findFolder(account.root.folders);
    if (!draggedFolder) return;

    // Check if dropped on a reorder zone
    if (overData?.type === 'reorder-zone') {
      const afterItemId = overData.afterItemId as string | undefined;
      const beforeItemId = overData.beforeItemId as string | undefined;
      const targetParentId = overData.parentId as string | undefined;

      // Get current parent ID
      const currentParentId = draggedFolder.parent?.$jazz.id;

      // Only allow reordering within the same parent
      if (currentParentId !== targetParentId) {
        return;
      }

      // Find target index
      const parentList = draggedFolder.parent?.children || account.root.folders;
      let newIndex: number;

      if (afterItemId) {
        const afterIndex = parentList.findIndex(
          (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === afterItemId,
        );
        newIndex = afterIndex + 1;
      } else if (beforeItemId) {
        newIndex = parentList.findIndex(
          (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === beforeItemId,
        );
      } else {
        newIndex = 0;
      }

      try {
        folderService.reorderFolder(account, draggedFolder, newIndex);
      } catch {
        // Silently ignore errors
      }
      return;
    }

    // Handle hierarchy changes (move into folders)
    let newParent: InstanceOfSchema<typeof FolderNode> | null = null;

    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParent = null; // Move to root level
    } else if (overData?.isFolder && overData?.folderId) {
      // Find the target folder
      const findTargetFolder = (
        folders: typeof account.root.folders,
      ): InstanceOfSchema<typeof FolderNode> | null => {
        for (const f of folders) {
          if (!f) continue;
          if (f.$jazz.id === overData.folderId) return f;
          if (f.children) {
            const found = findTargetFolder(f.children);
            if (found) return found;
          }
        }
        return null;
      };
      newParent = findTargetFolder(account.root.folders);
    }

    try {
      folderService.moveFolder(account, draggedFolder, newParent);
    } catch {
      // Silently ignore expected validation errors
    }
  };

  const handleDragCancel = () => {
    setActiveFolderId(null);
  };

  // Build hierarchical tree structure
  const folderTree = useMemo(
    () => buildFolderTree(Array.from(account.root?.folders || []), showArchivedTemplates),
    [account.root?.folders, showArchivedTemplates],
  );

  // Check if there are any archived folders
  const hasArchivedTemplates = useMemo(() => {
    return folderService.getArchivedFolders(account).length > 0;
  }, [account.root?.folders, account]);

  // Handle empty trash
  const handleEmptyTrash = async () => {
    const count = folderService.getArchivedFolders(account).length;
    if (count === 0) return;

    // Import showConfirm from dialog context at the component level
    // For now, we'll use window.confirm as a fallback
    const confirmed = window.confirm(
      `Permanently delete ${count} archived item${count === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (confirmed) {
      folderService.emptyTrash(account);
    }
  };

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { folder, children } = node;
    const isTemplate = folderService.isTemplateFolder(folder);

    // For templates, show sessions only when sessionsEnabled is true
    let sessionChildren: React.ReactNode[] = [];
    if (sessionsEnabled && isTemplate && folder.sessions) {
      const sessions = Array.isArray(folder.sessions)
        ? folder.sessions
        : // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x sessions may be CoList or array
          Array.from(folder.sessions as any);
      const activeSessions = sessions
        .filter((s: SessionData) => {
          if (!s || !s.id) return false; // Filter out sessions without IDs
          return showArchivedSessions || !s.archived;
        })
        .sort((a: SessionData, b: SessionData) => {
          const dateA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      sessionChildren = activeSessions.map((session: SessionData, index: number) => (
        <SessionRowView
          key={session.id || `session-${index}`}
          session={session}
          templateName={folder.name}
          level={node.level + 1}
          onOpen={(sessionId) => {
            // Expand the template and its ancestors
            folderService.expandAncestorFolders(folder);
            folderService.setFolderExpanded(folder, true);
            onOpenSession?.(folder.$jazz.id, sessionId);
          }}
          onArchive={(sessionId) => handleToggleArchiveSession(folder, sessionId)}
          onDelete={(sessionId) => handleDeleteSession(folder, sessionId)}
          onExport={(sessionId) => onExportSession?.(folder.$jazz.id, sessionId)}
          allSessions={activeSessions}
          hideArchiveAction={hideArchiveAction}
        />
      ));
    }

    const hasChildren = children.length > 0 || sessionChildren.length > 0;

    return (
      <FolderNodeView
        key={folder.$jazz.id}
        folder={folder}
        level={node.level}
        hasChildren={hasChildren}
        isSelected={selectedFolderId === folder.$jazz.id}
        onSelect={() => {
          onFolderSelect?.(folder.$jazz.id);
          // Also call onTemplateSelect for templates
          if (isTemplate) {
            onTemplateSelect?.(folder.$jazz.id);
          }
        }}
        onToggleExpand={() => handleToggleFolderExpand(folder)}
        onRename={(newName) => handleRenameFolder(folder, newName)}
        onArchive={() => handleToggleArchiveFolder(folder)}
        onDelete={() => handleDeleteFolder(folder)}
        onUseTemplate={isTemplate ? () => onUseTemplate?.(folder.$jazz.id) : undefined}
        onEditTemplate={isTemplate ? () => onEditTemplate?.(folder.$jazz.id) : undefined}
        account={account}
        hideArchiveAction={hideArchiveAction}
      >
        {/* Render children only when expanded */}
        {folder.expanded && (
          <>
            {/* Render sessions for templates */}
            {sessionChildren}
            {/* Render child folders recursively with reorder zones */}
            {children.map((childNode, childIndex) => {
              const parentId = folder.$jazz.id;

              return (
                <div key={childNode.folder.$jazz.id}>
                  {/* Reorder zone before first child */}
                  {childIndex === 0 && (
                    <ReorderDropZone
                      id={`reorder-before-${childNode.folder.$jazz.id}`}
                      beforeItemId={childNode.folder.$jazz.id}
                      parentId={parentId}
                      isDragging={!!activeFolderId}
                    />
                  )}
                  {renderNode(childNode)}
                  {/* Reorder zone after each child */}
                  <ReorderDropZone
                    id={`reorder-after-${childNode.folder.$jazz.id}`}
                    afterItemId={childNode.folder.$jazz.id}
                    beforeItemId={children[childIndex + 1]?.folder.$jazz.id}
                    parentId={parentId}
                    isDragging={!!activeFolderId}
                  />
                </div>
              );
            })}
          </>
        )}
      </FolderNodeView>
    );
  };

  // Determine button states based on selection
  const isTemplate = selectedFolder ? folderService.isTemplateFolder(selectedFolder) : false;

  // Show Edit/Use buttons only when a non-archived template is selected
  const canEditOrUse = isTemplate && !selectedFolder?.archived;

  // Always show New Folder/List buttons
  // Users can create new items at any time, regardless of selection or archived view state
  const canCreateFolderOrList = true;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="rounded-lg border border-neutral-200 bg-white flex flex-col flex-1 min-h-0">
        {/* Root-level drop zone with header */}
        <TreeViewHeader
          isDragging={!!activeFolderId}
          canCreateFolderOrList={canCreateFolderOrList}
          canEditOrUse={canEditOrUse}
          showArchivedTemplates={showArchivedTemplates}
          showArchivedSessions={showArchivedSessions}
          hideArchivedTemplatesToggle={hideArchivedTemplatesToggle}
          hideArchivedSessionsToggle={hideArchivedSessionsToggle}
          hasArchivedTemplates={hasArchivedTemplates}
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
          onToggleShowArchivedTemplates={() => setShowArchivedTemplates(!showArchivedTemplates)}
          onToggleShowArchivedSessions={() => setShowArchivedSessions(!showArchivedSessions)}
          onEmptyTrash={handleEmptyTrash}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          isAuthenticated={isAuthenticated}
          onSwitchView={onSwitchToSimplified}
          switchViewLabel={switchViewLabel}
        />

        {folderTree.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No lists yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="divide-y divide-neutral-100 p-2">
              {folderTree.map((node, index) => (
                <div key={node.folder.$jazz.id}>
                  {/* Reorder zone before first item */}
                  {index === 0 && (
                    <ReorderDropZone
                      id={`reorder-before-${node.folder.$jazz.id}`}
                      beforeItemId={node.folder.$jazz.id}
                      isDragging={!!activeFolderId}
                    />
                  )}
                  {renderNode(node)}
                  {/* Reorder zone after each item */}
                  <ReorderDropZone
                    id={`reorder-after-${node.folder.$jazz.id}`}
                    afterItemId={node.folder.$jazz.id}
                    beforeItemId={folderTree[index + 1]?.folder.$jazz.id}
                    isDragging={!!activeFolderId}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeFolderId && selectedFolder ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{selectedFolder.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
