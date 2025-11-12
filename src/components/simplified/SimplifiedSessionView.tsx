import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import type { Account, Template } from '@/schemas';
import * as simplifiedSessionService from '@/services/simplified/simplifiedSessionService';
import * as templateService from '@/services/templateService';
import { InlineItemForm } from './InlineItemForm';
import { SimplifiedFlatView } from './SimplifiedFlatView';
import { SimplifiedHeader } from './SimplifiedHeader';
import { SimplifiedZoneView } from './SimplifiedZoneView';

interface SimplifiedSessionViewProps {
  account: InstanceOfSchema<typeof Account>;
  template: InstanceOfSchema<typeof Template>;
  onBack: () => void;
}

type ViewMode = 'zone' | 'flat';

/**
 * SimplifiedSessionView - Main container for simplified session interface
 * Manages view mode state and renders either zone-based or flat list
 */
export function SimplifiedSessionView({ account, template, onBack }: SimplifiedSessionViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('zone');
  const [showAddForm, setShowAddForm] = useState(false);

  // Get or create current session
  const sessionId = simplifiedSessionService.getOrCreateCurrentSession(template);
  const session = template.sessions?.find((s) => s?.$jazz.id === sessionId);

  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
        <p className="text-neutral-600">Failed to load session</p>
      </div>
    );
  }

  const handleClear = () => {
    simplifiedSessionService.clearSessionState(template, sessionId);
  };

  const handleCheckToggle = (itemId: string) => {
    if (!session) return;

    const currentState = session.itemStates?.[itemId];
    const isChecked = currentState?.checked || false;

    // Toggle checked state
    const newItemStates = { ...session.itemStates };
    newItemStates[itemId] = {
      ...currentState,
      selected: currentState?.selected || false,
      checked: !isChecked,
    };

    session.$jazz.set('itemStates', newItemStates);

    // Update counts
    const items = template.items?.filter((item) => !item.archived) || [];
    let selectedCount = 0;
    let checkedCount = 0;

    for (const item of items) {
      const state = newItemStates[item.id];
      if (state?.checked) checkedCount++;
      if (state?.selected) selectedCount++;
    }

    session.$jazz.set('selectedCount', selectedCount);
    session.$jazz.set('checkedCount', checkedCount);
    session.$jazz.set('remainingCount', items.length - checkedCount);
    session.$jazz.set('lastActivityAt', new Date());
  };

  const handleDelete = (itemId: string) => {
    // Archive the template item (soft delete)
    templateService.archiveItem(account, template.$jazz.id, itemId);
  };

  const handleAddItem = (name: string, type: 'item' | 'category') => {
    // Create new template item at root level
    const newItem = {
      id: crypto.randomUUID(),
      name,
      type,
      path: name, // Root level path
      expanded: false,
      sortOrder: (template.items?.length || 0) + 1,
      archived: false,
      defaultQuantity: '1',
      createdAt: new Date(),
    };

    // Add to template
    const newItems = [...(template.items || []), newItem];
    template.$jazz.set('items', newItems);

    // Create corresponding ItemState entry
    const newItemStates = { ...session.itemStates };
    newItemStates[newItem.id] = {
      selected: false,
      checked: false,
    };
    session.$jazz.set('itemStates', newItemStates);

    // Update counts
    session.$jazz.set('remainingCount', (session.remainingCount || 0) + 1);
    session.$jazz.set('lastActivityAt', new Date());

    // Keep form open for rapid entry
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <SimplifiedHeader
          templateName={template.name}
          sessionDate={session.createdAt.toLocaleDateString()}
          viewMode={viewMode}
          showAddForm={showAddForm}
          onDone={onBack}
          onClear={handleClear}
          onViewModeToggle={() => setViewMode(viewMode === 'zone' ? 'flat' : 'zone')}
          onToggleAddForm={() => setShowAddForm(!showAddForm)}
        />

        {/* Inline form */}
        {showAddForm && (
          <div className="mb-6">
            <InlineItemForm onSubmit={handleAddItem} onClose={() => setShowAddForm(false)} />
          </div>
        )}

        {/* Content - zone or flat view */}
        {viewMode === 'zone' ? (
          <SimplifiedZoneView
            template={template}
            session={session}
            showTrash={showAddForm}
            onCheckToggle={handleCheckToggle}
            onDelete={handleDelete}
          />
        ) : (
          <SimplifiedFlatView
            template={template}
            session={session}
            showTrash={showAddForm}
            onCheckToggle={handleCheckToggle}
            onDelete={handleDelete}
          />
        )}
      </main>
    </div>
  );
}
