import type { InstanceOfSchema } from 'jazz-tools';
import type { SessionData, Template } from '@/schemas';
import { SimplifiedSessionItemRow } from './SimplifiedSessionItemRow';

interface SimplifiedFlatViewProps {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData;
  showTrash: boolean;
  selectedItemId: string | null;
  onCheckToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onSelectItem: (itemId: string | null) => void;
}

/**
 * SimplifiedFlatView - Flat list view for simplified session
 * Single list of all items (not grouped by zone)
 */
export function SimplifiedFlatView({
  template,
  session,
  showTrash,
  selectedItemId,
  onCheckToggle,
  onDelete,
  onSelectItem,
}: SimplifiedFlatViewProps) {
  // Get all non-archived items in their original order
  const items = template.items?.filter((item) => !item.archived) || [];

  // Sort by path to maintain hierarchy order (depth-first)
  const sortedItems = [...items].sort((a, b) => {
    return a.path.localeCompare(b.path);
  });

  if (sortedItems.length === 0) {
    return (
      <div className="text-center py-12 text-content-tertiary">
        <p>No items in this list yet</p>
        <p className="text-sm mt-1">Click "Add Item" to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated rounded-lg border border-divider-primary divide-y divide-divider-secondary">
      {sortedItems.map((item) => {
        const state = session.itemStates?.[item.id];
        const checked = state?.checked || false;
        const isSelected = showTrash && selectedItemId === item.id;

        // Calculate nesting level from path (count separators)
        // biome-ignore lint/suspicious/noControlCharactersInRegex: \x01 is the path separator used in schemas
        const level = (item.path.match(/\x01/g) || []).length;

        return (
          <SimplifiedSessionItemRow
            key={item.id}
            item={item}
            checked={checked}
            showTrash={showTrash}
            isSelected={isSelected}
            onCheckToggle={onCheckToggle}
            onDelete={onDelete}
            onSelect={showTrash ? onSelectItem : undefined}
            level={level}
          />
        );
      })}
    </div>
  );
}
