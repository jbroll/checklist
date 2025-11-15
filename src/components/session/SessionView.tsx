import type { InstanceOfSchema } from 'jazz-tools';
import { useLayoutEffect, useRef, useState } from 'react';
import { InlineItemForm } from '@/components/simplified/InlineItemForm';
import { useAccount } from '@/lib/jazz';
import { hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Account, Template } from '@/schemas';
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

  // Debug logging
  console.log(
    '[SessionView] Simplified mode:',
    simplifiedUI,
    'showAddForm:',
    showAddForm,
    'selectedItemId:',
    selectedItemId,
  );

  // Refs for scroll position preservation
  const availableZoneRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<{ scrollTop: number; availableTop: number } | null>(null);

  // Find session first (before any early returns)
  const session = template.sessions?.find((s) => s?.$jazz.id === sessionId);

  // Check if there are multiple sessions on the same day
  const showTime = hasMultipleSessionsOnSameDay(session || null, template.sessions || []);

  // Initialize category expanded state from session data
  const categoryExpanded: Record<string, boolean> = session?.categoryExpanded || {};

  // Use hooks for partitioning items
  // @ts-expect-error Jazz TypeScript inference issue with Account root type
  const { availableItems, selectedItems, checkedItems } = useSessionItems({ template, session });

  // Use hook for view mode management
  const { currentViewMode, cycleViewMode, getViewModeLabel, getViewModeIcon } = useViewMode({
    template,
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    session,
    sessionId,
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    me,
  });

  // Restore scroll position after DOM updates
  useLayoutEffect(() => {
    if (scrollPositionRef.current && availableZoneRef.current && scrollContainerRef.current) {
      const { scrollTop, availableTop } = scrollPositionRef.current;

      // Measure immediately after render
      const newAvailableTop = availableZoneRef.current.getBoundingClientRect().top;
      const heightDiff = newAvailableTop - availableTop;

      console.log(
        '[Restore] Old availableTop:',
        availableTop,
        'New:',
        newAvailableTop,
        'Diff:',
        heightDiff,
      );
      console.log(
        '[Restore] Current scrollTop:',
        scrollContainerRef.current.scrollTop,
        'Saved:',
        scrollTop,
      );

      if (heightDiff !== 0) {
        // Adjust scroll to compensate for height change
        const newScrollTop = scrollTop + heightDiff;
        console.log('[Restore] Setting scroll to:', newScrollTop);
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
      console.log(
        '[Capture] scrollTop:',
        scrollContainerRef.current.scrollTop,
        'availableTop:',
        scrollPositionRef.current.availableTop,
      );
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
    console.log('[handleBatchSelectAll] Called with:', itemIds);

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
    console.log('[handleBatchDeselectAll] Called with:', itemIds);

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
    console.log('[handleBatchToggle] Called with:', itemIds);

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

    console.log('[SessionView] handleAddItem:', { name, type, selectedItemId });

    // Calculate insertion point based on selected item (for simplified mode)
    const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
      template,
      selectedItemId,
    );

    console.log('[SessionView] Insertion point:', { parentPath, sortOrder });

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

    console.log('[SessionView] Created item:', newItemId);

    // Update session counts to include the new item
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);

    // Set newly created item as selected for consecutive insertion
    setSelectedItemId(newItemId);
    console.log('[SessionView] Set selected item to:', newItemId);

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
                simplifiedUI={simplifiedUI && showAddForm}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
