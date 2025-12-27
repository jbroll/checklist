import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import type { InstanceOfSchema } from 'jazz-tools';
import { Package } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { ItemInput } from '@/components/ui/ItemInput';
import { useAccount } from '@/lib/jazz';
import { useNavigationHistory } from '@/lib/useNavigationHistory';
import type { Account, SessionData, Template } from '@/schemas';
import { buildItemTree } from '@/utils/itemTreeHelpers';
import { FlatViewRenderer } from './FlatViewRenderer';
import { ItemNodeRenderer } from './ItemNodeRenderer';
import { NoteEditorDialog } from './NoteEditorDialog';
import { SessionHeader } from './SessionHeader';
import { SessionZone } from './SessionZone';
import { useNoteEditor } from './useNoteEditor';
import { useScrollPreservation } from './useScrollPreservation';
import { useSessionDragDrop } from './useSessionDragDrop';
import { useSessionHandlers } from './useSessionHandlers';
import { useSessionItems } from './useSessionItems';
import { useViewMode } from './useViewMode';
import { ZoneInHierarchyRenderer } from './ZoneInHierarchyRenderer';

interface SessionViewProps {
  template: InstanceOfSchema<typeof Template>;
  sessionId: string;
  onBack: () => void;
  onSwitchSession?: (newSessionId: string) => void;
}

export function SessionView({ template, sessionId, onBack, onSwitchSession }: SessionViewProps) {
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.19 MaybeLoaded type requires runtime checks
  const me = useAccount<typeof Account>() as any;
  const { navState, navigateTo, goBack } = useNavigationHistory();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [zoneExpanded, setZoneExpanded] = useState({
    available: true,
    selected: true,
    checked: false,
  });

  // Derive edit mode from navigation state
  const showAddForm = navState.view === 'session' && navState.editing === true;
  const templateId = template.$jazz.id;

  // Toggle edit mode with browser history
  const setShowAddForm = useCallback(
    (show: boolean) => {
      if (show) {
        // Entering edit mode: push new history entry so back button exits edit
        navigateTo({
          view: 'session',
          templateId,
          sessionId,
          editing: true,
        });
      } else {
        // Exiting edit mode: go back to previous state (don't push new entry)
        goBack();
      }
    },
    [navigateTo, goBack, templateId, sessionId],
  );

  // Get session early (before hooks)
  const sessions = template.sessions || [];
  const session = (sessions.find((s) => s?.id === sessionId) as SessionData | undefined) || null;

  // Get items and partition them
  const items = template.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Use hooks for partitioning items
  const { selectedItems, checkedItems } = useSessionItems({
    template,
    session,
  });

  // Use hook for view mode management
  const { currentViewMode, cycleViewMode, getViewModeLabel, getViewModeIcon } = useViewMode({
    template,
    session,
    sessionId,
    me,
  });

  // Scroll preservation hook
  const { scrollContainerRef, availableZoneRef, anchorRef, captureScrollPosition } =
    useScrollPreservation({
      selectedItemsCount: selectedItems.length,
      checkedItemsCount: checkedItems.length,
      showAddForm,
    });

  // Drag and drop hook
  const { sensors, activeItem, handleDragStart, handleDragEnd, handleDragCancel } =
    useSessionDragDrop({
      template,
      me,
      activeItems,
    });

  // Session handlers hook
  const handlers = useSessionHandlers({
    template,
    session,
    sessionId,
    me,
    activeItems,
    checkedItems,
    captureScrollPosition,
    setSelectedItemId,
    onSwitchSession,
  });

  // Note editor hook
  const noteEditor = useNoteEditor({
    template,
    session,
    sessionId,
    me,
    activeItems,
  });

  // Build hierarchical tree structure (memoized for performance)
  // Must be called before early returns to satisfy hooks rules
  const itemTree = useMemo(() => buildItemTree(activeItems), [activeItems]);

  // Early returns after all hooks
  if (!me || !me.root) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-divider-tertiary border-t-content-primary" />
          <p className="mt-4 text-content-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-content-secondary">Session not found</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Get category expanded state from viewState
  const templateCategoryExpanded: Record<string, boolean> =
    me?.root?.viewState?.templateCategoryExpanded?.[template.$jazz.id] || {};

  const isCategoryExpanded = (itemId: string): boolean => {
    return templateCategoryExpanded[itemId] ?? true;
  };

  // Shared props for view mode renderers (read-only mode)
  const toggleZoneExpanded = (zone: 'selected' | 'checked') =>
    setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }));

  const viewerCommonProps = {
    showDeleteIcon: false as const,
    interactionMode: { mode: 'normal' as const },
    onEnterEditMode: () => {},
    onExitEditMode: () => {},
    canEdit: () => false,
    canDrag: () => false,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen bg-surface-secondary p-3 sm:p-4 lg:p-6 flex flex-col">
        <div className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0">
          <div className="rounded-lg border border-divider-primary bg-surface-elevated flex flex-col flex-1 min-h-0">
            {/* Header */}
            <SessionHeader
              templateName={template.name}
              showAddForm={showAddForm}
              onToggleAddForm={setShowAddForm}
              onClearOrNew={handlers.handleClearOrNew}
              onCycleViewMode={cycleViewMode}
              getViewModeLabel={getViewModeLabel}
              getViewModeIcon={getViewModeIcon}
              onBack={onBack}
            />

            {/* Add Item Form */}
            {showAddForm && (
              <div className="border-b border-divider-primary bg-surface-secondary px-3 py-3 sm:px-4">
                <ItemInput
                  onSubmit={(value) =>
                    handlers.handleAddItemWithInsertionPoint(value, selectedItemId)
                  }
                  onCancel={() => setShowAddForm(false)}
                  showTypeToggle={true}
                  showQuantityField={false}
                  clearOnSubmit={true}
                  autoFocus={true}
                  autocompleteDomain={template.autocompleteDomain ?? 'grocery'}
                />
              </div>
            )}

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto min-h-0"
              style={{ scrollBehavior: 'auto' }}
            >
              {/* Selected and Checked Zones - rendered based on view mode */}
              {!showAddForm && currentViewMode === 'flat' && (
                <FlatViewRenderer
                  template={template}
                  session={session}
                  selectedItems={selectedItems}
                  checkedItems={checkedItems}
                  zoneExpanded={zoneExpanded}
                  onToggleZoneExpanded={toggleZoneExpanded}
                  onToggleSelected={handlers.handleToggleSelected}
                  onToggleChecked={handlers.handleToggleChecked}
                  onDeleteItem={handlers.handleDeleteItem}
                  onEditNote={noteEditor.openNoteEditor('selected')}
                  {...viewerCommonProps}
                />
              )}

              {/* Zone-in-hierarchy mode */}
              {!showAddForm && currentViewMode === 'zone-in-hierarchy' && (
                <ZoneInHierarchyRenderer
                  template={template}
                  session={session}
                  selectedItems={selectedItems}
                  checkedItems={checkedItems}
                  categoryExpanded={templateCategoryExpanded}
                  onToggleCategoryExpanded={handlers.handleToggleCategoryExpanded}
                  onToggleSelected={handlers.handleToggleSelected}
                  onToggleChecked={handlers.handleToggleChecked}
                  onDeleteItem={handlers.handleDeleteItem}
                  onEditNote={noteEditor.openNoteEditor('selected')}
                  {...viewerCommonProps}
                />
              )}

              {/* Empty state - shopping mode with no selected items */}
              {!showAddForm && selectedItems.length === 0 && checkedItems.length === 0 && (
                <div className="p-8 text-center text-content-tertiary">
                  <p>No items selected for this session.</p>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="mt-4 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Edit to select default items
                  </button>
                </div>
              )}

              {/* Edit mode - show all items with checkboxes to edit defaults */}
              {showAddForm &&
                (itemTree.length === 0 ? (
                  <div className="p-8 text-center text-content-tertiary bg-blue-50 dark:bg-blue-900/20">
                    <p>No items in this list yet.</p>
                  </div>
                ) : (
                  <div ref={availableZoneRef} className="bg-blue-50 dark:bg-blue-900/20 p-4">
                    <SessionZone
                      title="Default Items"
                      icon={Package}
                      zone="available"
                      items={activeItems}
                      itemStates={session.itemStates || {}}
                      expanded={zoneExpanded.available}
                      onToggleExpand={() =>
                        setZoneExpanded((prev) => ({ ...prev, available: !prev.available }))
                      }
                      onToggleSelected={handlers.handleToggleDefault}
                      onToggleChecked={handlers.handleToggleChecked}
                      onBatchSelectAll={handlers.handleBatchDefaultSelectAll}
                      onBatchDeselectAll={handlers.handleBatchDefaultDeselectAll}
                      onBatchToggle={handlers.handleBatchDefaultToggle}
                      count={activeItems.length}
                      showHeading={true}
                      onEditNote={noteEditor.openNoteEditor('available')}
                    >
                      <div className="divide-y divide-divider-secondary">
                        {/* Invisible anchor element for scroll preservation */}
                        <div ref={anchorRef} className="h-0" />
                        {itemTree.map((node, index) => (
                          <ItemNodeRenderer
                            key={node.item.id}
                            node={node}
                            depth={0}
                            siblings={itemTree}
                            index={index}
                            showAddForm={showAddForm}
                            selectedItemId={selectedItemId}
                            currentItemId={currentItemId}
                            setSelectedItemId={setSelectedItemId}
                            setCurrentItemId={setCurrentItemId}
                            session={session}
                            template={template}
                            activeItems={activeItems}
                            activeItem={activeItem}
                            isCategoryExpanded={isCategoryExpanded}
                            onRenameItem={handlers.handleRenameItem}
                            onDeleteItem={handlers.handleDeleteItem}
                            onToggleExpand={handlers.handleToggleExpand}
                            onToggleSelected={handlers.handleToggleDefault}
                            onToggleChecked={handlers.handleToggleChecked}
                            onBatchSelectAll={handlers.handleBatchDefaultSelectAll}
                            onBatchDeselectAll={handlers.handleBatchDefaultDeselectAll}
                            onBatchToggle={handlers.handleBatchDefaultToggle}
                            onEditNote={noteEditor.openNoteEditor('available')}
                          />
                        ))}
                      </div>
                    </SessionZone>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="bg-surface-elevated border-2 border-green-500 rounded-md px-3 py-2 shadow-lg opacity-90">
            <span className="font-medium">{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Note Editor Dialog */}
      <NoteEditorDialog
        open={noteEditor.noteEditorOpen}
        onOpenChange={noteEditor.setNoteEditorOpen}
        itemName={noteEditor.noteEditingItemName}
        note={noteEditor.noteEditingCurrentNote}
        templateNote={noteEditor.noteEditingTemplateNote}
        onSave={noteEditor.handleSaveNote}
        noteType={noteEditor.noteEditingType}
      />
    </DndContext>
  );
}
