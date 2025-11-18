import type { InstanceOfSchema } from 'jazz-tools';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InlineItemForm } from '@/components/simplified/InlineItemForm';
import { useAccount } from '@/lib/jazz';
import { useSessionInteractionMode } from '@/lib/useSessionInteractionMode';
import { hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Account, SessionData, Template } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import { AvailableZoneRenderer } from './AvailableZoneRenderer';
import { FlatViewRenderer } from './FlatViewRenderer';
import { SessionHeader } from './SessionHeader';
import { useSessionItems } from './useSessionItems';
import { useViewMode } from './useViewMode';
import { ZoneInHierarchyRenderer } from './ZoneInHierarchyRenderer';

interface SessionViewProps {
  template: InstanceOfSchema<typeof Template>;
  sessionId: string;
  onBack: () => void;
  simplifiedUI?: boolean;
}

export function SessionView({
  template,
  sessionId,
  onBack,
  simplifiedUI = false,
}: SessionViewProps) {
  const { me } = useAccount<typeof Account>();
  const [zoneExpanded, setZoneExpanded] = useState({
    available: true,
    selected: true,
    checked: false,
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Centralized interaction mode manager
  const {
    interactionMode,
    isAdding,
    enterAddMode,
    enterEditMode,
    enterDragMode,
    exitToNormal,
    exitCurrentMode,
    canEdit,
    canDrag,
  } = useSessionInteractionMode();

  // Sync showAddForm with interaction mode
  useEffect(() => {
    if (showAddForm && !isAdding) {
      enterAddMode();
    } else if (!showAddForm && isAdding) {
      exitToNormal();
    }
  }, [showAddForm, isAdding, enterAddMode, exitToNormal]);

  // Refs for scroll position preservation
  const availableZoneRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<{ scrollTop: number; availableTop: number } | null>(null);

  // Find session first (before any early returns)
  const sessions: SessionData[] = template.sessions
    ? Array.isArray(template.sessions)
      ? template.sessions
      : // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x sessions may be CoList or array
        Array.from(template.sessions as any)
    : [];
  const session = sessions.find((s: SessionData) => s?.id === sessionId);

  // Check if there are multiple sessions on the same day
  const showTime = hasMultipleSessionsOnSameDay(session || null, sessions);

  // Initialize category expanded state from session data
  const categoryExpanded: Record<string, boolean> = session?.categoryExpanded || {};

  // Use hooks for partitioning items
  const { availableItems, selectedItems, checkedItems } = useSessionItems({
    template,
    session: session || null,
  });

  // Use hook for view mode management
  const { currentViewMode, cycleViewMode, getViewModeLabel, getViewModeIcon } = useViewMode({
    template,
    session: session || null,
    sessionId,
    // @ts-expect-error - Jazz v0.18.x Account.root nullable during migration, but is guaranteed non-null here after guard clause
    me: me || null,
  });

  // Restore scroll position after DOM updates
  useLayoutEffect(() => {
    if (scrollPositionRef.current && availableZoneRef.current && scrollContainerRef.current) {
      const { scrollTop, availableTop } = scrollPositionRef.current;

      // Measure immediately after render
      const newAvailableTop = availableZoneRef.current.getBoundingClientRect().top;
      const heightDiff = newAvailableTop - availableTop;

      if (heightDiff !== 0) {
        // Adjust scroll to compensate for height change
        const newScrollTop = scrollTop + heightDiff;
        scrollContainerRef.current.scrollTop = newScrollTop;
      }

      scrollPositionRef.current = null;
    }
  });

  // Now handle early returns after hooks
  if (!me || !me.root || !template.sessions) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-neutral-600">Session not found</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-green-600 hover:text-green-700"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const handleToggleSelected = (itemId: string) => {
    // Capture scroll state before DOM changes
    if (availableZoneRef.current && scrollContainerRef.current) {
      scrollPositionRef.current = {
        scrollTop: scrollContainerRef.current.scrollTop,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleToggleChecked = (itemId: string) => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemChecked(me, template.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleFinishSession = () => {
    onBack();
  };

  const handleToggleArchived = () => {
    if (!session || !me) return;
    if (session.archived) {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
      SessionService.unarchiveSession(me, template.$jazz.id, sessionId);
    } else {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
      SessionService.archiveSession(me, template.$jazz.id, sessionId);
    }
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (!session || !me) return;
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with Account root type
    SessionService.toggleCategoryExpanded(me, template.$jazz.id, sessionId, catKey);
  };

  const handleBatchSelectAll = (itemIds: string[]) => {
    // Capture scroll state before DOM changes
    if (availableZoneRef.current && scrollContainerRef.current) {
      scrollPositionRef.current = {
        scrollTop: scrollContainerRef.current.scrollTop,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, true);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleBatchDeselectAll = (itemIds: string[]) => {
    // Capture scroll state before DOM changes
    if (availableZoneRef.current && scrollContainerRef.current) {
      scrollPositionRef.current = {
        scrollTop: scrollContainerRef.current.scrollTop,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, false);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleBatchToggle = (itemIds: string[]) => {
    // Capture scroll state before DOM changes
    if (availableZoneRef.current && scrollContainerRef.current) {
      scrollPositionRef.current = {
        scrollTop: scrollContainerRef.current.scrollTop,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.invertItemSelection(me, template.$jazz.id, sessionId, itemIds);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleClear = () => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.clearSessionState(me, template.$jazz.id, sessionId);
  };

  const handleAddItem = (name: string, type: 'item' | 'category') => {
    if (!me) return;

    // Calculate insertion point based on selected item (for simplified mode)
    const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
      template,
      selectedItemId,
    );

    // Create new template item at calculated position using service layer
    // Type assertion needed because Jazz account.root can be null during migration, but is guaranteed here
    let newItemId: string;
    if (type === 'item') {
      newItemId = templateService.createItem(
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x Account.root nullable during migration
        me as any,
        template.$jazz.id,
        name,
        parentPath,
        '',
        sortOrder,
      );
    } else {
      newItemId = templateService.createCategory(
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x Account.root nullable during migration
        me as any,
        template.$jazz.id,
        name,
        parentPath,
        sortOrder,
      );
    }

    // Update session counts to include the new item
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);

    // Set newly created item as selected for consecutive insertion
    setSelectedItemId(newItemId);

    // Keep form open for rapid entry
  };

  const handleDeleteItem = (itemId: string) => {
    if (!me) return;
    // Archive the template item (soft delete)
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    templateService.archiveItem(me, template.$jazz.id, itemId);
  };

  const renderSelectedAndChecked = () => {
    if (!session) return null;

    if (currentViewMode === 'flat') {
      return (
        <FlatViewRenderer
          template={template}
          session={session}
          selectedItems={selectedItems}
          checkedItems={checkedItems}
          zoneExpanded={{ selected: zoneExpanded.selected, checked: zoneExpanded.checked }}
          onToggleZoneExpanded={(zone) =>
            setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))
          }
          onToggleSelected={handleToggleSelected}
          onToggleChecked={handleToggleChecked}
          showDeleteIcon={simplifiedUI && showAddForm}
          onDeleteItem={handleDeleteItem}
          // Interaction mode props
          interactionMode={interactionMode}
          onEnterEditMode={enterEditMode}
          onExitEditMode={() => exitCurrentMode(isAdding)}
          canEdit={canEdit}
          canDrag={canDrag}
        />
      );
    }

    if (currentViewMode === 'zone-in-hierarchy') {
      return (
        <ZoneInHierarchyRenderer
          template={template}
          session={session}
          selectedItems={selectedItems}
          checkedItems={checkedItems}
          categoryExpanded={categoryExpanded}
          onToggleCategoryExpanded={handleToggleCategoryExpanded}
          onToggleSelected={handleToggleSelected}
          onToggleChecked={handleToggleChecked}
          showDeleteIcon={simplifiedUI && showAddForm}
          onDeleteItem={handleDeleteItem}
          // Interaction mode props
          interactionMode={interactionMode}
          onEnterEditMode={enterEditMode}
          onExitEditMode={() => exitCurrentMode(isAdding)}
          canEdit={canEdit}
          canDrag={canDrag}
        />
      );
    }

    return null;
  };

  return (
    <div className="h-screen bg-neutral-50 p-6 flex flex-col">
      <div className="mx-auto max-w-4xl w-full flex-1 flex flex-col min-h-0">
        <div className="rounded-lg border border-neutral-200 bg-white flex flex-col flex-1 min-h-0">
          <SessionHeader
            template={template}
            session={session}
            sessionId={sessionId}
            // @ts-expect-error Jazz TypeScript inference issue with Account root type
            me={me}
            showTime={showTime}
            viewModeIcon={getViewModeIcon()}
            viewModeLabel={getViewModeLabel()}
            onCycleViewMode={cycleViewMode}
            onFinishSession={handleFinishSession}
            onToggleArchived={handleToggleArchived}
            simplifiedUI={simplifiedUI}
            showAddForm={showAddForm}
            onClear={handleClear}
            onToggleAddForm={() => setShowAddForm(!showAddForm)}
          />

          {/* Inline form for adding items (simplified UI only) */}
          {simplifiedUI && showAddForm && (
            <div className="px-4 py-4 border-b border-neutral-100">
              <InlineItemForm onSubmit={handleAddItem} onClose={() => setShowAddForm(false)} />
            </div>
          )}

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
            {renderSelectedAndChecked()}
            <div ref={availableZoneRef}>
              <AvailableZoneRenderer
                template={template}
                session={session}
                availableItems={availableItems}
                categoryExpanded={categoryExpanded}
                zoneExpanded={zoneExpanded.available}
                onToggleZoneExpanded={() =>
                  setZoneExpanded((prev) => ({ ...prev, available: !prev.available }))
                }
                onToggleCategoryExpanded={handleToggleCategoryExpanded}
                onToggleSelected={handleToggleSelected}
                onToggleChecked={handleToggleChecked}
                onBatchSelectAll={handleBatchSelectAll}
                onBatchDeselectAll={handleBatchDeselectAll}
                onBatchToggle={handleBatchToggle}
                showDeleteIcon={simplifiedUI && showAddForm}
                onDeleteItem={handleDeleteItem}
                selectedItemId={simplifiedUI && showAddForm ? selectedItemId : null}
                onSelectItem={simplifiedUI && showAddForm ? setSelectedItemId : undefined}
                // Interaction mode props
                interactionMode={interactionMode}
                onEnterEditMode={enterEditMode}
                onExitEditMode={() => exitCurrentMode(isAdding)}
                onEnterDragMode={enterDragMode}
                onExitDragMode={() => exitCurrentMode(isAdding)}
                canEdit={canEdit}
                canDrag={canDrag}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
