import type { InstanceOfSchema } from 'jazz-tools';
import type { SessionData, Template, TemplateItem } from '@/schemas';
import { SimplifiedSessionItemRow } from './SimplifiedSessionItemRow';

interface SimplifiedZoneViewProps {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData;
  showTrash: boolean;
  selectedItemId: string | null;
  onCheckToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onSelectItem: (itemId: string | null) => void;
}

/**
 * SimplifiedZoneView - Zone-based view for simplified session
 * Filters items into three zones: Available, Selected, Checked
 */
export function SimplifiedZoneView({
  template,
  session,
  showTrash,
  selectedItemId,
  onCheckToggle,
  onDelete,
  onSelectItem,
}: SimplifiedZoneViewProps) {
  console.log('[SimplifiedZoneView] Props:', {
    showTrash,
    selectedItemId,
    hasOnSelectItem: !!onSelectItem,
  });

  // Get all non-archived items
  const items = template.items?.filter((item) => !item.archived) || [];

  // Filter items into zones based on state
  const availableItems: TemplateItem[] = [];
  const selectedItems: TemplateItem[] = [];
  const checkedItems: TemplateItem[] = [];

  for (const item of items) {
    const state = session.itemStates?.[item.id];
    const isChecked = state?.checked || false;
    const isSelected = state?.selected || false;

    if (isChecked) {
      checkedItems.push(item);
    } else if (isSelected) {
      selectedItems.push(item);
    } else {
      availableItems.push(item);
    }
  }

  const renderZone = (
    title: string,
    items: TemplateItem[],
    showTrashForZone: boolean,
    enableSelection: boolean,
  ) => {
    console.log('[SimplifiedZoneView] renderZone:', {
      title,
      itemCount: items.length,
      showTrashForZone,
      enableSelection,
    });

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-content-tertiary uppercase tracking-wide mb-2 px-3">
          {title}
        </h3>
        <div className="bg-surface-elevated rounded-lg border border-divider-primary divide-y divide-divider-secondary">
          {items.map((item) => {
            const state = session.itemStates?.[item.id];
            const checked = state?.checked || false;
            const isSelected = enableSelection && selectedItemId === item.id;

            console.log('[SimplifiedZoneView] Rendering row:', {
              itemName: item.name,
              isSelected,
              enableSelection,
              selectedItemId,
              itemId: item.id,
            });

            return (
              <SimplifiedSessionItemRow
                key={item.id}
                item={item}
                checked={checked}
                showTrash={showTrashForZone}
                isSelected={isSelected}
                onCheckToggle={onCheckToggle}
                onDelete={onDelete}
                onSelect={enableSelection ? onSelectItem : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Available Zone - show trash when form is open, enable selection */}
      {renderZone('Available', availableItems, showTrash, showTrash)}

      {/* Selected Zone */}
      {renderZone('Selected', selectedItems, false, false)}

      {/* Checked Zone */}
      {renderZone('Checked', checkedItems, false, false)}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 text-content-tertiary">
          <p>No items in this list yet</p>
          <p className="text-sm mt-1">Click "Add Item" to get started</p>
        </div>
      )}
    </div>
  );
}
