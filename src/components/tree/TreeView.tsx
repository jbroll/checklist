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
import { useCallback, useMemo, useState } from 'react';
import { InstallInstructionsDialog } from '@/components/ui/InstallInstructionsDialog';
import { arraysEqualById, isTemplateFolder, useCheckListHierarchy } from '@/hooks';
import { usePWAInstall } from '@/lib/usePWAInstall';
import { usePort, useRowboat, useSelect } from '@/rowboat';
import type { FolderRow } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import * as sessionService from '@/services/sessionService';
import { FolderNodeView } from './FolderNodeView';
import { ReorderDropZone } from './ReorderDropZone';
import { SessionRowView } from './SessionRowView';
import { TreeViewHeader } from './TreeViewHeader';

// Tree structure for rendering
interface TreeNode {
  folder: FolderRow;
  children: TreeNode[];
  level: number;
}

// Grouped prop interfaces to reduce prop drilling
export interface TreeViewSelectionHandlers {
  onFolderSelect?: (folderId: string) => void;
  onTemplateSelect?: (templateId: string) => void;
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
  selectedTemplateId?: string | null;
  selectedFolderId?: string | null;
  selectionHandlers?: TreeViewSelectionHandlers;
  headerActions?: TreeViewHeaderActions;
  authProps?: TreeViewAuthProps;
  archiveSettings?: TreeViewArchiveSettings;
  subscriptionInfo?: TreeViewSubscriptionInfo;
}

/** Build the hierarchical tree from a flat `FolderRow[]` (reactive selector output). */
function buildFolderTree(folders: FolderRow[], showArchived: boolean): TreeNode[] {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const folder of folders) {
    if (!showArchived && folder.archived) continue;
    const key = folder.parent_id;
    const siblings = byParent.get(key) ?? [];
    siblings.push(folder);
    byParent.set(key, siblings);
  }

  function build(parentId: string | null, level: number): TreeNode[] {
    const siblings = byParent.get(parentId) ?? [];
    return siblings
      .slice()
      .sort((a, b) => a.created_at - b.created_at)
      .map((folder) => ({
        folder,
        children: build(folder.id, level + 1),
        level,
      }));
  }

  return build(null, 0);
}

export function TreeView({
  selectedTemplateId,
  selectedFolderId,
  selectionHandlers = {},
  headerActions = {},
  authProps = {},
  archiveSettings = {},
  subscriptionInfo = {},
}: TreeViewProps) {
  const { onFolderSelect, onTemplateSelect, onOpenSession, onExportSession } = selectionHandlers;
  const { onHeaderClick, onAddFolder, onAddTemplate, onExport, onImport } = headerActions;
  const { subscriptionTier, listCount, maxLists, onUpgradeClick } = subscriptionInfo;
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
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);

  const { author, mintGroup } = usePort();
  const {
    findById,
    renameNode,
    archiveNode,
    unarchiveNode,
    deleteNode,
    moveNode,
    archivedFolders,
    emptyTrash,
  } = useCheckListHierarchy({ createdBy: author ?? 'anon', mintGroup });

  // The hook's own `folders`/`allFolders` are TOP-LEVEL only and change-detected by shallow
  // (id, updated_at) comparison — a rename/move nested two levels deep wouldn't flip that
  // array's identity. Reading the whole `folder` table directly here (instead) means every
  // graph write re-runs this selector, so nested changes are never missed.
  const g = useRowboat();
  // MUST pass isEqual: the selector maps into a fresh array every call, and
  // useSyncExternalStore's default Object.is never matches a freshly-mapped
  // array — without this the snapshot never "settles" and React infinite-loops
  // the render (confirmed via browser console: "getSnapshot should be cached").
  const allFolderRows = useSelect(
    () => g.folder.all().map((n) => parseFolderRow(n.$data)),
    arraysEqualById,
  );

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);

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

  const selectedFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return findById(selectedFolderId) ?? null;
  }, [selectedFolderId, findById]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleToggleFolderExpand = useCallback(
    (folder: FolderRow) => {
      void g.folder.update(folder.id, { expanded: !folder.expanded });
    },
    [g],
  );

  const handleRenameFolder = useCallback(
    (folder: FolderRow, newName: string) => {
      void renameNode(folder.id, newName);
    },
    [renameNode],
  );

  const handleToggleArchiveFolder = useCallback(
    (folder: FolderRow) => {
      if (folder.archived) {
        void unarchiveNode(folder.id);
      } else {
        void archiveNode(folder.id);
      }
    },
    [archiveNode, unarchiveNode],
  );

  const handleDeleteFolder = useCallback(
    (folder: FolderRow) => {
      void deleteNode(folder.id);
    },
    [deleteNode],
  );

  const handleToggleArchiveSession = useCallback(
    (templateId: string, sessionId: string, archived: boolean) => {
      if (archived) {
        void sessionService.unarchiveSession(g, templateId, sessionId);
      } else {
        void sessionService.archiveSession(g, templateId, sessionId);
      }
    },
    [g],
  );

  const handleDeleteSession = useCallback(
    (templateId: string, sessionId: string) => {
      void sessionService.deleteSession(g, templateId, sessionId);
    },
    [g],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const folderId = event.active.data.current?.folderId as string;
    setActiveFolderId(folderId);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // No-op: reserved for future visual feedback during drag.
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveFolderId(null);
      if (!over || !active.data.current) return;

      const draggedFolderId = active.data.current.folderId as string;
      const overData = over.data.current;
      const draggedFolder = findById(draggedFolderId);
      if (!draggedFolder) return;

      let newParentId: string | null | undefined;
      if (overData?.path === '__ROOT_DROP_ZONE__') {
        newParentId = null;
      } else if (overData?.isFolder && overData?.folderId) {
        newParentId = overData.folderId as string;
      }

      if (newParentId === undefined) return;

      try {
        void moveNode(draggedFolder.id, newParentId);
      } catch (error) {
        console.error('[TreeView] Error moving folder:', error);
      }
    },
    [findById, moveNode],
  );

  const handleDragCancel = useCallback(() => {
    setActiveFolderId(null);
  }, []);

  const folderTree = useMemo(
    () => buildFolderTree(allFolderRows, showArchivedTemplates),
    [allFolderRows, showArchivedTemplates],
  );

  const hasArchivedTemplates = archivedFolders.length > 0;

  const handleEmptyTrash = useCallback(() => {
    void emptyTrash();
  }, [emptyTrash]);

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { folder, children } = node;
    const isTemplate = isTemplateFolder(folder);

    let sessionChildren: React.ReactNode[] = [];
    if (isTemplate) {
      const activeSessions = folder.sessions
        .filter((s) => showArchivedSessions || !s.archived)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt);

      sessionChildren = activeSessions.map((session) => (
        <SessionRowView
          key={session.id}
          session={session}
          templateName={folder.name}
          level={node.level + 1}
          onOpen={(sessionId) => onOpenSession?.(folder.id, sessionId)}
          onArchive={(sessionId) =>
            handleToggleArchiveSession(folder.id, sessionId, session.archived)
          }
          onDelete={(sessionId) => handleDeleteSession(folder.id, sessionId)}
          onExport={(sessionId) => onExportSession?.(folder.id, sessionId)}
          allSessions={activeSessions}
          hideArchiveAction={hideArchiveAction}
        />
      ));
    }

    const hasChildren = children.length > 0 || sessionChildren.length > 0;

    return (
      <FolderNodeView
        key={folder.id}
        folder={folder}
        level={node.level}
        hasChildren={hasChildren}
        isSelected={selectedFolderId === folder.id || selectedTemplateId === folder.id}
        onSelect={() => {
          onFolderSelect?.(folder.id);
          if (isTemplate) onTemplateSelect?.(folder.id);
        }}
        onToggleExpand={() => handleToggleFolderExpand(folder)}
        onRename={(newName) => handleRenameFolder(folder, newName)}
        onArchive={() => handleToggleArchiveFolder(folder)}
        onDelete={() => handleDeleteFolder(folder)}
        autoStartEditing={editingFolderId === folder.id}
        onAutoEditStarted={() => setEditingFolderId(null)}
        hideArchiveAction={hideArchiveAction}
      >
        {folder.expanded && sessionChildren}
        {folder.expanded &&
          children.map((childNode, childIndex) => (
            <div key={childNode.folder.id}>
              {childIndex === 0 && (
                <ReorderDropZone
                  id={`reorder-before-${childNode.folder.id}`}
                  beforeItemId={childNode.folder.id}
                  parentId={folder.id}
                  isDragging={!!activeFolderId}
                />
              )}
              {renderNode(childNode)}
              <ReorderDropZone
                id={`reorder-after-${childNode.folder.id}`}
                afterItemId={childNode.folder.id}
                beforeItemId={children[childIndex + 1]?.folder.id}
                parentId={folder.id}
                isDragging={!!activeFolderId}
              />
            </div>
          ))}
      </FolderNodeView>
    );
  };

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
        <TreeViewHeader
          isDragging={!!activeFolderId}
          canCreateFolderOrList={true}
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
          onToggleShowArchivedTemplates={() => setShowArchivedTemplates((v) => !v)}
          onToggleShowArchivedSessions={() => setShowArchivedSessions((v) => !v)}
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
                <div key={node.folder.id}>
                  {index === 0 && (
                    <ReorderDropZone
                      id={`reorder-before-${node.folder.id}`}
                      beforeItemId={node.folder.id}
                      isDragging={!!activeFolderId}
                    />
                  )}
                  {renderNode(node)}
                  <ReorderDropZone
                    id={`reorder-after-${node.folder.id}`}
                    afterItemId={node.folder.id}
                    beforeItemId={folderTree[index + 1]?.folder.id}
                    isDragging={!!activeFolderId}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeFolderId && selectedFolder ? (
          <div className="bg-surface-elevated border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{selectedFolder.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      <InstallInstructionsDialog open={showInstallDialog} onOpenChange={setShowInstallDialog} />
    </DndContext>
  );
}
