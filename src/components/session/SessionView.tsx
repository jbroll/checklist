import type { InstanceOfSchema } from 'jazz-tools';
import { useLayoutEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/jazz';
import { hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Account, Template } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import { AvailableZoneRenderer } from './AvailableZoneRenderer';
import { FlatViewRenderer } from './FlatViewRenderer';
import { HierarchyInZonesRenderer } from './HierarchyInZonesRenderer';
import { SessionHeader } from './SessionHeader';
import { useSessionItems } from './useSessionItems';
import { useViewMode } from './useViewMode';
import { ZoneInHierarchyRenderer } from './ZoneInHierarchyRenderer';

interface SessionViewProps {
  template: InstanceOfSchema<typeof Template>;
  sessionId: string;
  onBack: () => void;
}

export function SessionView({ template, sessionId, onBack }: SessionViewProps) {
  const { me } = useAccount<typeof Account>();
  const [zoneExpanded, setZoneExpanded] = useState({
    available: true,
    selected: true,
    checked: false,
  });

  // Refs for scroll position preservation
  const availableZoneRef = useRef<HTMLDivElement>(null);
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
    if (scrollPositionRef.current && availableZoneRef.current) {
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
      console.log('[Restore] Current scrollTop:', window.scrollY, 'Saved:', scrollTop);

      if (heightDiff !== 0) {
        // Adjust scroll to compensate for height change
        const newScrollTop = scrollTop + heightDiff;
        console.log('[Restore] Setting scroll to:', newScrollTop);
        window.scrollTo(0, newScrollTop);
      }

      scrollPositionRef.current = null;
    }
  });

  // Now handle early returns after hooks
  if (!me || !template.sessions) {
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
    if (availableZoneRef.current) {
      scrollPositionRef.current = {
        scrollTop: window.scrollY,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
      console.log(
        '[Capture] scrollTop:',
        window.scrollY,
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
    session.$jazz.set('archived', !session.archived);
    session.$jazz.set('lastActivityAt', new Date());
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (session?.categoryExpanded) {
      const currentValue = categoryExpanded[catKey] ?? true;
      session.$jazz.set('categoryExpanded', {
        ...categoryExpanded,
        [catKey]: !currentValue,
      });
    }
  };

  const handleBatchSelectAll = (itemIds: string[]) => {
    console.log('[handleBatchSelectAll] Called with:', itemIds);

    // Capture scroll state before DOM changes
    if (availableZoneRef.current) {
      scrollPositionRef.current = {
        scrollTop: window.scrollY,
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
    if (availableZoneRef.current) {
      scrollPositionRef.current = {
        scrollTop: window.scrollY,
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
    if (availableZoneRef.current) {
      scrollPositionRef.current = {
        scrollTop: window.scrollY,
        availableTop: availableZoneRef.current.getBoundingClientRect().top,
      };
    }

    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.invertItemSelection(me, template.$jazz.id, sessionId, itemIds);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
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
        />
      );
    }

    if (currentViewMode === 'hierarchy-in-zones') {
      return (
        <HierarchyInZonesRenderer
          template={template}
          session={session}
          selectedItems={selectedItems}
          checkedItems={checkedItems}
          categoryExpanded={categoryExpanded}
          zoneExpanded={{ selected: zoneExpanded.selected, checked: zoneExpanded.checked }}
          onToggleZoneExpanded={(zone) =>
            setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))
          }
          onToggleCategoryExpanded={handleToggleCategoryExpanded}
          onToggleSelected={handleToggleSelected}
          onToggleChecked={handleToggleChecked}
          onBatchSelectAll={handleBatchSelectAll}
          onBatchDeselectAll={handleBatchDeselectAll}
          onBatchToggle={handleBatchToggle}
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
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-neutral-200 bg-white">
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
          />

          <div>
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
