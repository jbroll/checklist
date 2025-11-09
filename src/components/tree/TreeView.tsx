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
import type { Account, Template } from '@/schemas';
import { buildFolderTree, moveTemplate, toggleFolderExpanded, type DerivedFolder } from '@/services/templateService';
import { FolderNodeView } from './FolderNodeView';
import { SessionRowView } from './SessionRowView';
import { TreeViewHeader } from './TreeViewHeader';

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
  const [activeTemplate, setActiveTemplate] = useState<InstanceOfSchema<typeof Template> | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
  );

  const handleToggleFolderExpand = (folderPath: string) => {
    toggleFolderExpanded(account, folderPath);
  };

  const handleRenameTemplate = (templateId: string, newName: string) => {
    const template = account.root?.templates?.find((t) => t?.$jazz.id === templateId);
    if (template) {
      template.$jazz.set('name', newName);
      template.$jazz.set('updatedAt', new Date());
    }
  };

  const handleDeleteTemplate = (templateId: string) => {
    const template = account.root?.templates?.find((t) => t?.$jazz.id === templateId);
    if (template) {
      template.$jazz.set('archived', true);
      template.$jazz.set('updatedAt', new Date());
    }
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
    const draggedTemplate = event.active.data.current?.template as InstanceOfSchema<typeof Template>;
    setActiveTemplate(draggedTemplate);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Optional: Add visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveTemplate(null);

    if (!over || !active.data.current) {
      return;
    }

    const draggedTemplate = active.data.current.template as InstanceOfSchema<typeof Template>;
    const overData = over.data.current;

    // Determine the new parent path
    let newParentPath: string | undefined;

    // IMPORTANT: Check virtual root zone FIRST
    if (overData?.path === '__ROOT_DROP_ZONE__') {
      newParentPath = undefined; // Move to root level
    } else if (overData?.isFolder) {
      // Dropped on a folder - move inside it
      newParentPath = overData.path as string;
    } else if (overData?.template) {
      // Dropped on another template - move to same parent
      const targetTemplate = overData.template as InstanceOfSchema<typeof Template>;
      const pathParts = targetTemplate.path.split('/');
      newParentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;
    } else {
      // No valid drop target
      return;
    }

    // Don't move if dropped on same location
    const pathParts = draggedTemplate.path.split('/');
    const currentParentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;

    if (newParentPath === currentParentPath) {
      return;
    }

    try {
      moveTemplate(account, draggedTemplate, newParentPath);
    } catch {
      // Silently ignore expected validation errors (moving into self, naming conflicts)
    }
  };

  const handleDragCancel = () => {
    setActiveTemplate(null);
  };

  // Build hierarchical folder tree structure from template paths
  const folderTree = useMemo(() => buildFolderTree(account), [account.root?.templates, account.root?.folderExpanded]);

  const renderFolder = (folder: DerivedFolder, level = 0): React.ReactNode => {
    const hasChildren = folder.children.length > 0 || folder.templates.length > 0;

    return (
      <FolderNodeView
        key={folder.path}
        folder={folder}
        level={level}
        hasChildren={hasChildren}
        isSelected={false}
        onToggleExpand={() => handleToggleFolderExpand(folder.path)}
        account={account}
      >
        {/* Render children only when expanded */}
        {folder.expanded && (
          <>
            {/* Render templates in this folder */}
            {folder.templates.map((template) => {
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

              const hasTemplateChildren = activeSessions.length > 0;

              return (
                <FolderNodeView
                  key={template.$jazz.id}
                  template={template}
                  level={level + 1}
                  hasChildren={hasTemplateChildren}
                  isSelected={selectedTemplateId === template.$jazz.id}
                  onSelect={onTemplateSelect}
                  onToggleExpand={() => {
                    template.$jazz.set('archived', !template.archived);
                    template.$jazz.set('updatedAt', new Date());
                  }}
                  onRename={handleRenameTemplate}
                  onDelete={handleDeleteTemplate}
                  onUseTemplate={onUseTemplate}
                  onEditTemplate={onEditTemplate}
                  account={account}
                >
                  {activeSessions.map((session) => (
                    <SessionRowView
                      key={session.$jazz.id}
                      session={session}
                      templateName={template.name}
                      level={level + 2}
                      onOpen={(sessionId) => {
                        onOpenSession?.(template.$jazz.id, sessionId);
                      }}
                      onDelete={(sessionId) => handleDeleteSession(template.$jazz.id, sessionId)}
                      onExport={(sessionId) => onExportSession?.(template.$jazz.id, sessionId)}
                      allSessions={activeSessions}
                    />
                  ))}
                </FolderNodeView>
              );
            })}
            {/* Render child folders recursively */}
            {folder.children.map((childFolder) => renderFolder(childFolder, level + 1))}
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
          isDragging={!!activeTemplate}
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

        {folderTree.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No lists yet.</p>
            <p className="mt-1 text-sm">Create a folder to organize your list items.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 p-2">
            {folderTree.map((folder) => renderFolder(folder))}
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTemplate ? (
          <div className="bg-white border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{activeTemplate.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
