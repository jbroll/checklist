import type { InstanceOfSchema } from 'jazz-tools';
import type { Session, Template, TemplateItem } from '@/schemas';
import { SimplifiedSessionItemRow } from './SimplifiedSessionItemRow';

interface SimplifiedZoneViewProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  showTrash: boolean;
  onCheckToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

/**
 * SimplifiedZoneView - Zone-based view for simplified session
 * Filters items into three zones: Available, Selected, Checked
 */
export function SimplifiedZoneView({
  template,
  session,
  showTrash,
  onCheckToggle,
  onDelete,
}: SimplifiedZoneViewProps) {
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

  const renderZone = (title: string, items: TemplateItem[], showTrashForZone: boolean) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2 px-3">
          {title}
        </h3>
        <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
          {items.map((item) => {
            const state = session.itemStates?.[item.id];
            const checked = state?.checked || false;

            return (
              <SimplifiedSessionItemRow
                key={item.id}
                item={item}
                checked={checked}
                showTrash={showTrashForZone}
                onCheckToggle={onCheckToggle}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Available Zone - show trash when form is open */}
      {renderZone('Available', availableItems, showTrash)}

      {/* Selected Zone */}
      {renderZone('Selected', selectedItems, false)}

      {/* Checked Zone */}
      {renderZone('Checked', checkedItems, false)}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p>No items in this list yet</p>
          <p className="text-sm mt-1">Click "Add Item" to get started</p>
        </div>
      )}
    </div>
  );
}
