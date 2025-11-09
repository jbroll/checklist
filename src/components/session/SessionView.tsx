import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import { useAccount } from '@/lib/jazz';
import { hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Account, Template } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import { FlatViewRenderer } from './FlatViewRenderer';
import { HierarchyInZonesRenderer } from './HierarchyInZonesRenderer';
import { InventoryZoneRenderer } from './InventoryZoneRenderer';
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
    inventory: true,
    cart: true,
    completed: false,
  });

  // Find session first (before any early returns)
  const session = template.sessions?.find((s) => s?.$jazz.id === sessionId);

  // Check if there are multiple sessions on the same day
  const showTime = hasMultipleSessionsOnSameDay(session || null, template.sessions || []);

  // Initialize category expanded state from session data
  const categoryExpanded: Record<string, boolean> = session?.categoryExpanded || {};

  // Use hooks for partitioning items
  // @ts-expect-error Jazz TypeScript inference issue with Account root type
  const { inventoryItems, cartItems, completedItems } = useSessionItems({ template, session });

  // Use hook for view mode management
  const { currentViewMode, cycleViewMode, getViewModeLabel, getViewModeIcon } = useViewMode({
    template,
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    session,
    sessionId,
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    me,
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

  const handleToggleCart = (itemId: string) => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleTogglePurchased = (itemId: string) => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.toggleItemChecked(me, template.$jazz.id, sessionId, itemId);
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.updateSessionCounts(me, template.$jazz.id, sessionId);
  };

  const handleFinishSession = () => {
    // @ts-expect-error Jazz TypeScript inference issue with Account root type
    SessionService.completeSession(me, template.$jazz.id, sessionId);
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

  const renderInCartAndCompleted = () => {
    if (!session) return null;

    if (currentViewMode === 'flat') {
      return (
        <FlatViewRenderer
          template={template}
          session={session}
          cartItems={cartItems}
          completedItems={completedItems}
          zoneExpanded={{ cart: zoneExpanded.cart, completed: zoneExpanded.completed }}
          onToggleZoneExpanded={(zone) =>
            setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))
          }
          onToggleSelected={handleToggleCart}
          onToggleChecked={handleTogglePurchased}
        />
      );
    }

    if (currentViewMode === 'hierarchy-in-zones') {
      return (
        <HierarchyInZonesRenderer
          template={template}
          session={session}
          cartItems={cartItems}
          completedItems={completedItems}
          categoryExpanded={categoryExpanded}
          zoneExpanded={{ cart: zoneExpanded.cart, completed: zoneExpanded.completed }}
          onToggleZoneExpanded={(zone) =>
            setZoneExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))
          }
          onToggleCategoryExpanded={handleToggleCategoryExpanded}
          onToggleSelected={handleToggleCart}
          onToggleChecked={handleTogglePurchased}
        />
      );
    }

    if (currentViewMode === 'zone-in-hierarchy') {
      return (
        <ZoneInHierarchyRenderer
          template={template}
          session={session}
          cartItems={cartItems}
          completedItems={completedItems}
          categoryExpanded={categoryExpanded}
          onToggleCategoryExpanded={handleToggleCategoryExpanded}
          onToggleSelected={handleToggleCart}
          onToggleChecked={handleTogglePurchased}
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

          <div className="divide-y divide-neutral-100 p-2">
            {renderInCartAndCompleted()}
            {/* Divider between In Cart/Completed and Inventory */}
            {(cartItems.length > 0 || completedItems.length > 0) && inventoryItems.length > 0 && (
              <div className="my-2 border-t-2 border-neutral-200" />
            )}
            <InventoryZoneRenderer
              template={template}
              session={session}
              inventoryItems={inventoryItems}
              categoryExpanded={categoryExpanded}
              zoneExpanded={zoneExpanded.inventory}
              onToggleZoneExpanded={() =>
                setZoneExpanded((prev) => ({ ...prev, inventory: !prev.inventory }))
              }
              onToggleCategoryExpanded={handleToggleCategoryExpanded}
              onToggleSelected={handleToggleCart}
              onToggleChecked={handleTogglePurchased}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
