import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import type { Account, Template } from '@/schemas';
import * as sessionService from '@/services/sessionService';
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Get or create current session
  const sessionId = simplifiedSessionService.getOrCreateCurrentSession(account, template);
  const session = template.sessions?.find((s) => s?.$jazz.id === sessionId);

  if (!session) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
        <p className="text-neutral-600">Failed to load session</p>
      </div>
    );
  }

  const handleClear = () => {
    sessionService.clearSessionState(account, template.$jazz.id, sessionId);
  };

  const handleCheckToggle = (itemId: string) => {
    if (!session) return;

    // Toggle checked state using service layer
    sessionService.toggleItemChecked(account, template.$jazz.id, sessionId, itemId);

    // Update session counts using service layer
    sessionService.updateSessionCounts(account, template.$jazz.id, sessionId);
  };

  const handleDelete = (itemId: string) => {
    // Archive the template item (soft delete)
    templateService.archiveItem(account, template.$jazz.id, itemId);
  };

  const handleAddItem = (name: string, type: 'item' | 'category') => {
    // Calculate insertion point based on selected item
    const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
      template,
      selectedItemId,
    );

    // Create new template item at calculated position using service layer
    let newItemId: string;
    if (type === 'item') {
      newItemId = templateService.createItem(
        account,
        template.$jazz.id,
        name,
        parentPath,
        '1',
        sortOrder,
      );
    } else {
      newItemId = templateService.createCategory(
        account,
        template.$jazz.id,
        name,
        parentPath,
        sortOrder,
      );
    }

    // Update session counts to include the new item
    sessionService.updateSessionCounts(account, template.$jazz.id, sessionId);

    // Set the newly created item as selected for consecutive insertion
    setSelectedItemId(newItemId);

    // Keep form open for rapid entry
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-neutral-200 bg-white">
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
            <div className="px-4 py-4">
              <InlineItemForm onSubmit={handleAddItem} onClose={() => setShowAddForm(false)} />
            </div>
          )}

          {/* Content - zone or flat view */}
          <div className="p-4">
            {viewMode === 'zone' ? (
              <SimplifiedZoneView
                template={template}
                session={session}
                showTrash={showAddForm}
                selectedItemId={selectedItemId}
                onCheckToggle={handleCheckToggle}
                onDelete={handleDelete}
                onSelectItem={setSelectedItemId}
              />
            ) : (
              <SimplifiedFlatView
                template={template}
                session={session}
                showTrash={showAddForm}
                selectedItemId={selectedItemId}
                onCheckToggle={handleCheckToggle}
                onDelete={handleDelete}
                onSelectItem={setSelectedItemId}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
