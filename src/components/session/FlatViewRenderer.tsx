import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { SessionData, Template, TemplateItem } from '@/schemas';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import { SessionZone } from './SessionZone';

interface FlatViewRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData;
  selectedItems: TemplateItem[];
  checkedItems: TemplateItem[];
  zoneExpanded: {
    selected: boolean;
    checked: boolean;
  };
  onToggleZoneExpanded: (zone: 'selected' | 'checked') => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  showDeleteIcon?: boolean;
  onDeleteItem?: (itemId: string) => void;
  // Interaction mode props (for consistency, though these zones aren't draggable)
  interactionMode: InteractionMode;
  onEnterEditMode: (itemId: string) => void;
  onExitEditMode: () => void;
  canEdit: (itemId: string) => boolean;
  canDrag: (itemId: string) => boolean;
}

export function FlatViewRenderer({
  template,
  session,
  selectedItems,
  checkedItems,
  zoneExpanded,
  onToggleZoneExpanded,
  onToggleSelected,
  onToggleChecked,
  showDeleteIcon = false,
  onDeleteItem,
  // Interaction mode props - accepted but not used in non-draggable zones
}: FlatViewRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  return (
    <>
      <SessionZone
        title="Selected"
        icon={ListChecks}
        zone="selected"
        items={selectedItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.selected}
        onToggleExpand={() => onToggleZoneExpanded('selected')}
        onToggleSelected={onToggleSelected}
        onToggleChecked={onToggleChecked}
        count={selectedItems.length}
        showHeading={showZoneHeadings}
        showDeleteIcon={showDeleteIcon}
        onDeleteItem={onDeleteItem}
        template={template}
        // Note: Selected/checked zones don't support inline editing or dragging
        // Items can only be moved back to available zone via checkboxes
      />
      <SessionZone
        title="Checked"
        icon={CheckCircle2}
        zone="checked"
        items={checkedItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.checked}
        onToggleExpand={() => onToggleZoneExpanded('checked')}
        onToggleSelected={onToggleSelected}
        onToggleChecked={onToggleChecked}
        count={checkedItems.length}
        showHeading={showZoneHeadings}
        showDeleteIcon={showDeleteIcon}
        onDeleteItem={onDeleteItem}
        template={template}
        // Note: Selected/checked zones don't support inline editing or dragging
        // Items can only be moved back to available zone via checkboxes
      />
    </>
  );
}
