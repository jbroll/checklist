import type { InstanceOfSchema } from 'jazz-tools';
import { Check, Download, MoreVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/jazz';
import type { FolderNode, GroceriesAccount } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import { SessionZone } from './SessionZone';

interface ShoppingSessionViewProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  sessionId: string;
  onBack: () => void;
}

export function ShoppingSessionView({ folder, sessionId, onBack }: ShoppingSessionViewProps) {
  const { me } = useAccount<typeof GroceriesAccount>();
  const [zoneExpanded, setZoneExpanded] = useState({
    inventory: true,
    cart: true,
    completed: false,
  });
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Find session first (before any early returns)
  const session = folder.sessions?.find((s) => s?.$jazz.id === sessionId);
  const items = folder.items || [];
  // Only show leaf items (not categories) in shopping sessions
  const activeItems = items.filter((item) => item && !item.archived && item.type === 'item');

  // Partition items into three zones based on their state (must be called before early returns)
  const { inventoryItems, cartItems, completedItems } = useMemo(() => {
    const inventory: typeof activeItems = [];
    const cart: typeof activeItems = [];
    const completed: typeof activeItems = [];

    if (!session) {
      return {
        inventoryItems: inventory,
        cartItems: cart,
        completedItems: completed,
      };
    }

    activeItems.forEach((item) => {
      const state = session.itemStates?.[item.$jazz.id];
      if (!state || (!state.inCart && !state.purchased)) {
        inventory.push(item);
      } else if (state.purchased) {
        completed.push(item);
      } else if (state.inCart) {
        cart.push(item);
      }
    });

    return {
      inventoryItems: inventory,
      cartItems: cart,
      completedItems: completed,
    };
  }, [activeItems, session]);

  // Now handle early returns after hooks
  if (!me || !folder.sessions) {
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
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.toggleItemInCart(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleTogglePurchased = (itemId: string) => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.toggleItemPurchased(me, folder.$jazz.id, sessionId, itemId);
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.updateSessionCounts(me, folder.$jazz.id, sessionId);
  };

  const handleFinishSession = () => {
    // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
    SessionService.completeSession(me, folder.$jazz.id, sessionId);
    onBack();
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-neutral-900">
            {session.name} <span className="text-neutral-500">· {folder.name}</span>
          </h1>
          <div className="flex items-center gap-2">
            {/* TODO: Implement hierarchy view modes
            <button
              type="button"
              onClick={cycleViewMode}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              title="Cycle view mode"
            >
              <LayoutGrid className="h-4 w-4" />
              {getViewModeLabel()}
            </button>
            */}
            <button
              type="button"
              onClick={handleFinishSession}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
              Finish Shopping
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4 text-neutral-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content: Simple flat zones view */}
        <div className="rounded-lg border border-neutral-200 bg-white p-2">
          <SessionZone
            title="In Cart"
            icon="🛒"
            zone="cart"
            items={cartItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.cart}
            onToggleExpand={() => setZoneExpanded((prev) => ({ ...prev, cart: !prev.cart }))}
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={cartItems.length}
          />
          <SessionZone
            title="Completed"
            icon="✅"
            zone="completed"
            items={completedItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.completed}
            onToggleExpand={() =>
              setZoneExpanded((prev) => ({ ...prev, completed: !prev.completed }))
            }
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={completedItems.length}
          />
          <SessionZone
            title="List Inventory"
            icon="📦"
            zone="inventory"
            items={inventoryItems}
            itemStates={session.itemStates || {}}
            expanded={zoneExpanded.inventory}
            onToggleExpand={() =>
              setZoneExpanded((prev) => ({ ...prev, inventory: !prev.inventory }))
            }
            onToggleCart={handleToggleCart}
            onTogglePurchased={handleTogglePurchased}
            count={inventoryItems.length}
          />
        </div>

        {/* Export Dialog */}
        {me && (
          <SessionExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            folder={folder}
            sessionId={sessionId}
            sessionName={session.name}
            // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with account types
            account={me}
          />
        )}
      </div>
    </div>
  );
}
