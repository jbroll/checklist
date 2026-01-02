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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InstallInstructionsDialog } from '@/components/ui/InstallInstructionsDialog';
import { isTemplateFolder, useCheckListHierarchy } from '@/hooks';
import { legacyStorageKey } from '@/lib/brand';
import { useDialog } from '@/lib/dialog-context';
import { iterateSessions } from '@/lib/jazz-types';
import { usePWAInstall } from '@/lib/usePWAInstall';
import type { Account, FolderNode, SessionData } from '@/schemas';
import * as sessionService from '@/services/sessionService';
import * as viewStateService from '@/services/viewStateService';
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

// Grouped prop interfaces to reduce prop drilling
export interface TreeViewSelectionHandlers {
  onTemplateSelect?: (templateId: string) => void;
  onFolderSelect?: (folderId: string) => void;
  onOpenSession?: (templateId: string, sessionId: string) => void;
  onExportSession?: (templateId: string, sessionId: string) => void;
}

export interface TreeViewHeaderActions {
  onHeaderClick?: () => void;
  onAddFolder?: () => void;
  onAddTemplate?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export interface TreeViewAuthProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  isAuthenticated?: boolean;
  showProfileDialog?: boolean;
  onShowProfileDialogChange?: (show: boolean) => void;
}

export interface TreeViewArchiveSettings {
  hideArchivedTemplatesToggle?: boolean;
  hideArchivedSessionsToggle?: boolean;
  hideArchiveAction?: boolean;
}

export interface TreeViewSubscriptionInfo {
  subscriptionTier?: string;
  listCount?: number;
  maxLists?: number;
  onUpgradeClick?: () => void;
}

interface TreeViewProps {
  account: InstanceOfSchema<typeof Account>;
  selectedTemplateId?: string | null;
  selectedFolderId?: string | null;
  selectionHandlers?: TreeViewSelectionHandlers;
  headerActions?: TreeViewHeaderActions;
  authProps?: TreeViewAuthProps;
  archiveSettings?: TreeViewArchiveSettings;
  subscriptionInfo?: TreeViewSubscriptionInfo;
}

/**
 * Expand all ancestor folders in viewState to make a folder visible
 */
function expandAncestorFoldersInViewState(
  account: InstanceOfSchema<typeof Account>,
  folder: InstanceOfSchema<typeof FolderNode>,
): void {
  let current = folder.parent;
  while (current) {
    viewStateService.setFolderExpanded(account, current.$jazz.id, true);
    current = current.parent;
  }
}

/**
 * Build hierarchical tree from FolderNode structure
 */
function buildFolderTree(
  folders: InstanceOfSchema<typeof FolderNode>[] | null | undefined,
  showArchived: boolean,
  level = 0,
): TreeNode[] {
  if (!folders || !Array.isArray(folders)) return [];
  const nodes: TreeNode[] = [];

  for (const folder of folders) {
    if (!folder) continue;
    if (!showArchived && folder.archived) continue;

    const children =
      folder.children && Array.isArray(folder.children)
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
  selectedTemplateId: _selectedTemplateId,
  selectedFolderId,
  selectionHandlers = {},
  headerActions = {},
  authProps = {},
  archiveSettings = {},
  subscriptionInfo = {},
}: TreeViewProps) {
  // Destructure grouped props
  const { onTemplateSelect, onFolderSelect, onOpenSession, onExportSession } = selectionHandlers;
  const { onHeaderClick, onAddFolder, onAddTemplate, onExport, onImport } = headerActions;
  const {
    onSignOut,
    onSignIn,
    onDeleteAccount,
    isAuthenticated,
    showProfileDialog,
    onShowProfileDialogChange,
  } = authProps;
  const {
    hideArchivedTemplatesToggle = false,
    hideArchivedSessionsToggle = false,
    hideArchiveAction = false,
  } = archiveSettings;
  const { subscriptionTier, listCount, maxLists, onUpgradeClick } = subscriptionInfo;
  const { showConfirm } = useDialog();

  // Use jbr-jazz hierarchy hook for folder operations
  const {
    findById,
    renameNode,
    archiveNode,
    unarchiveNode,
    deleteNode,
    moveNode,
    moveNodeToIndex,
    archivedFolders,
    emptyTrash,
  } = useCheckListHierarchy(account);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(() => {
    const stored = localStorage.getItem(legacyStorageKey('show-archived-templates'));
    return stored === 'true';
  });
  const [showArchivedSessions, setShowArchivedSessions] = useState(() => {
    const stored = localStorage.getItem(legacyStorageKey('show-archived-sessions'));
    return stored === 'true';
  });

  // PWA install state
  const { showInstallOption, hasNativePrompt, triggerInstall } = usePWAInstall();
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  const handleInstallApp = useCallback(() => {
    if (hasNativePrompt) {
      triggerInstall();
    } else {
      setShowInstallDialog(true);
    }
  }, [hasNativePrompt, triggerInstall]);

  // Persist archived view preferences
  useEffect(() => {
    localStorage.setItem(
      legacyStorageKey('show-archived-templates'),
      String(showArchivedTemplates),
    );
  }, [showArchivedTemplates]);

  useEffect(() => {
    localStorage.setItem(legacyStorageKey('show-archived-sessions'), String(showArchivedSessions));
  }, [showArchivedSessions]);

  // Get selected folder by ID
  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return findById(selectedFolderId);
  }, [selectedFolderId, findById]);

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

  const handleToggleFolderExpand = useCallback(
    (folder: InstanceOfSchema<typeof FolderNode>) => {
      viewStateService.toggleFolderExpanded(account, folder.$jazz.id);
    },
    [account],
  );

  const handleRenameFolder = useCallback(
    (folder: InstanceOfSchema<typeof FolderNode>, newName: string) => {
      renameNode(folder, newName);
    },
    [renameNode],
  );

  const handleToggleArchiveFolder = useCallback(
    (folder: InstanceOfSchema<typeof FolderNode>) => {
      if (folder.archived) {
        unarchiveNode(folder);
      } else {
        archiveNode(folder);
      }
    },
    [archiveNode, unarchiveNode],
  );

  const handleDeleteFolder = useCallback(
    (folder: InstanceOfSchema<typeof FolderNode>) => {
      deleteNode(folder);
    },
    [deleteNode],
  );

  const handleFolderDuplicated = useCallback((newFolder: InstanceOfSchema<typeof FolderNode>) => {
    // Trigger inline rename mode on the new folder (don't select/navigate)
    setEditingFolderId(newFolder.$jazz.id);
  }, []);

  const handleToggleArchiveSession = useCallback(
    (templateFolder: InstanceOfSchema<typeof FolderNode>, sessionId: string) => {
      const sessions = iterateSessions<SessionData>(templateFolder.sessions);
      const session = sessions.find((s: SessionData) => s?.id === sessionId);
      if (session) {
        if (session.archived) {
          sessionService.unarchiveSession(account, templateFolder.$jazz.id, sessionId);
        } else {
          sessionService.archiveSession(account, templateFolder.$jazz.id, sessionId);
        }
      }
    },
    [account],
  );

  const handleDeleteSession = useCallback(
    (templateFolder: InstanceOfSchema<typeof FolderNode>, sessionId: string) => {
      sessionService.deleteSession(account, templateFolder.$jazz.id, sessionId);
    },
    [account],
  );

  // Drag and drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const folderId = event.active.data.current?.folderId as string;
    setActiveFolderId(folderId);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveFolderId(null);

      if (!over || !active.data.current || !account.root?.folders) {
        return;
      }

      const draggedFolderId = active.data.current.folderId as string;
      const overData = over.data.current;

      const draggedFolder = findById(draggedFolderId);
      if (!draggedFolder) return;

      // Check if dropped on a reorder zone
      if (overData?.type === 'reorder-zone') {
        const afterItemId = overData.afterItemId as string | undefined;
        const beforeItemId = overData.beforeItemId as string | undefined;
        const targetParentId = overData.parentId as string | undefined;

        // Find target parent folder (undefined means root level)
        const targetParent = targetParentId ? findById(targetParentId) : undefined;

        // Get the target list (either parent's children or root folders)
        const targetList = targetParent?.children || account.root.folders;

        // Find target index in the new parent's list
        let newIndex: number;

        if (afterItemId) {
          const afterIndex = targetList.findIndex(
            (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === afterItemId,
          );
          newIndex = afterIndex + 1;
        } else if (beforeItemId) {
          newIndex = targetList.findIndex(
            (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === beforeItemId,
          );
        } else {
          newIndex = 0;
        }

        try {
          // Use moveNodeToIndex which handles both cross-parent moves and same-parent reorders
          moveNodeToIndex(draggedFolder, targetParent, newIndex);
        } catch (error) {
          console.error('[TreeView] Error moving folder to index:', error);
        }
        return;
      }

      // Handle hierarchy changes (move into folders)
      let newParent: InstanceOfSchema<typeof FolderNode> | undefined;

      if (overData?.path === '__ROOT_DROP_ZONE__') {
        newParent = undefined; // Move to root level
      } else if (overData?.isFolder && overData?.folderId) {
        // Find the target folder
        newParent = findById(overData.folderId as string) ?? undefined;
      }

      try {
        moveNode(draggedFolder, newParent);
      } catch (error) {
        // Log unexpected errors (not circular move validation)
        if (!(error instanceof Error && error.message.includes('Cannot move folder into itself'))) {
          console.error('[TreeView] Error moving folder:', error);
        }
      }
    },
    [account, findById, moveNode, moveNodeToIndex],
  );

  const handleDragCancel = useCallback(() => {
    setActiveFolderId(null);
  }, []);

  // Build hierarchical tree structure
  const folderTree = useMemo(() => {
    const folders = account.root?.folders;
    const foldersArray =
      folders && Array.isArray(folders) ? folders : folders ? Array.from(folders) : [];
    return buildFolderTree(foldersArray, showArchivedTemplates);
  }, [account.root?.folders, showArchivedTemplates]);

  // Check if there are any archived folders
  const hasArchivedTemplates = useMemo(() => {
    return archivedFolders.length > 0;
  }, [archivedFolders]);

  // Handle empty trash
  const handleEmptyTrash = useCallback(async () => {
    const count = archivedFolders.length;
    if (count === 0) return;

    const confirmed = await showConfirm({
      title: 'Empty Trash',
      message: `Permanently delete ${count} archived item${count === 1 ? '' : 's'}? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      emptyTrash();
    }
  }, [archivedFolders, showConfirm, emptyTrash]);

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { folder, children } = node;
    const isTemplate = isTemplateFolder(folder);

    // For templates, always show sessions
    let sessionChildren: React.ReactNode[] = [];
    if (isTemplate && folder.sessions) {
      const sessions = iterateSessions<SessionData>(folder.sessions);
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
            // Expand the template and its ancestors using viewState
            expandAncestorFoldersInViewState(account, folder);
            viewStateService.setFolderExpanded(account, folder.$jazz.id, true);
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
        onDuplicated={handleFolderDuplicated}
        autoStartEditing={editingFolderId === folder.$jazz.id}
        onAutoEditStarted={() => setEditingFolderId(null)}
        account={account}
        hideArchiveAction={hideArchiveAction}
      >
        {/* Render children only when expanded - use viewState for per-user expansion */}
        {viewStateService.getFolderExpanded(account, folder.$jazz.id) && (
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
      <div className="rounded-lg border border-divider-primary bg-surface-elevated flex flex-col flex-1 min-h-0">
        {/* Root-level drop zone with header */}
        <TreeViewHeader
          isDragging={!!activeFolderId}
          canCreateFolderOrList={canCreateFolderOrList}
          showArchivedTemplates={showArchivedTemplates}
          showArchivedSessions={showArchivedSessions}
          hideArchivedTemplatesToggle={hideArchivedTemplatesToggle}
          hideArchivedSessionsToggle={hideArchivedSessionsToggle}
          hasArchivedTemplates={hasArchivedTemplates}
          onHeaderClick={onHeaderClick || (() => {})}
          onAddFolder={onAddFolder || (() => {})}
          onAddTemplate={onAddTemplate || (() => {})}
          onExport={onExport || (() => {})}
          onImport={onImport || (() => {})}
          onToggleShowArchivedTemplates={() => setShowArchivedTemplates(!showArchivedTemplates)}
          onToggleShowArchivedSessions={() => setShowArchivedSessions(!showArchivedSessions)}
          onEmptyTrash={handleEmptyTrash}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
          onDeleteAccount={onDeleteAccount}
          isAuthenticated={isAuthenticated}
          showProfileDialog={showProfileDialog}
          onShowProfileDialogChange={onShowProfileDialogChange}
          canInstallApp={showInstallOption}
          onInstallApp={handleInstallApp}
          onAbout={() => {
            window.location.href = '/about.html';
          }}
          subscriptionTier={subscriptionTier}
          listCount={listCount}
          maxLists={maxLists}
          onUpgradeClick={onUpgradeClick}
        />

        {folderTree.length === 0 ? (
          <div className="p-8 text-center text-content-tertiary">
            <p>No lists yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="divide-y divide-divider-secondary p-2">
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
          <div className="bg-surface-elevated border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{selectedFolder.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* PWA Install Instructions Dialog */}
      <InstallInstructionsDialog open={showInstallDialog} onOpenChange={setShowInstallDialog} />
    </DndContext>
  );
}
