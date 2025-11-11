import type { InstanceOfSchema } from 'jazz-tools';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { Session, Template, TemplateItem } from '@/schemas';
import { SessionZone } from './SessionZone';

interface FlatViewRendererProps {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session>;
  selectedItems: TemplateItem[];
  checkedItems: TemplateItem[];
  zoneExpanded: {
    selected: boolean;
    checked: boolean;
  };
  onToggleZoneExpanded: (zone: 'selected' | 'checked') => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
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
      />
    </>
  );
}
