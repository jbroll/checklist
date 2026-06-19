import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { InteractionMode } from '@/lib/useSessionInteractionMode';
import type { SessionData, Template, TemplateItem } from '@/schema';
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
  // Notes
  onEditNote?: (itemId: string) => void;
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
  interactionMode,
  onEnterEditMode,
  onExitEditMode,
  canEdit,
  canDrag,
  onEditNote,
}: FlatViewRendererProps) {
  const showZoneHeadings = template.showZoneHeadings ?? false;

  const itemActions = {
    onToggleSelected,
    onToggleChecked,
    onDeleteItem,
    showDeleteIcon,
  };

  const itemEditModeProps = {
    interactionMode,
    onEnterItemEditMode: onEnterEditMode,
    onExitItemEditMode: onExitEditMode,
    canEditItemFn: canEdit,
    canDragItemFn: canDrag,
    onEditNote,
  };

  return (
    <>
      <SessionZone
        items={selectedItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.selected}
        onToggleExpand={() => onToggleZoneExpanded('selected')}
        template={template}
        zoneConfig={{
          title: 'Selected',
          icon: ListChecks,
          zone: 'selected',
          count: selectedItems.length,
          showHeading: showZoneHeadings,
        }}
        itemActions={itemActions}
        itemEditModeProps={itemEditModeProps}
      />
      <SessionZone
        items={checkedItems}
        itemStates={session.itemStates || {}}
        expanded={zoneExpanded.checked}
        onToggleExpand={() => onToggleZoneExpanded('checked')}
        template={template}
        zoneConfig={{
          title: 'Checked',
          icon: CheckCircle2,
          zone: 'checked',
          count: checkedItems.length,
          showHeading: showZoneHeadings,
        }}
        itemActions={itemActions}
        itemEditModeProps={itemEditModeProps}
      />
    </>
  );
}
