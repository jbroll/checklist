import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import type { FolderNode, ListSession, TemplateItem } from '@/schemas';
import { SessionZone } from './SessionZone';

interface FlatViewRendererProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  session: InstanceOfSchema<typeof ListSession>;
  cartItems: InstanceOfSchema<typeof TemplateItem>[];
  completedItems: InstanceOfSchema<typeof TemplateItem>[];
  zoneExpanded: {
    cart: boolean;
    completed: boolean;
  };
  onToggleZoneExpanded: (zone: 'cart' | 'completed') => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
}

export function FlatViewRenderer({
  folder,
  session,
  cartItems,
  completedItems,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleSelected,
  onToggleChecked,
}: FlatViewRendererProps) {
  const showZoneHeadings = folder.showZoneHeadings ?? false;

  return (
    <>
      <SessionZone
        title="In Cart"
        icon={ShoppingCart}
        zone="cart"
        items={cartItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.cart}
        onToggleExpand={() => onToggleZoneExpanded('cart')}
        onToggleSelected={onToggleSelected}
        onToggleChecked={onToggleChecked}
        count={cartItems.length}
        showHeading={showZoneHeadings}
      />
      <SessionZone
        title="Completed"
        icon={CheckCircle2}
        zone="completed"
        items={completedItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.completed}
        onToggleExpand={() => onToggleZoneExpanded('completed')}
        onToggleSelected={onToggleSelected}
        onToggleChecked={onToggleChecked}
        count={completedItems.length}
        showHeading={showZoneHeadings}
      />
    </>
  );
}
