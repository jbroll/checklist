import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ItemState } from '@/schema/folder';
import { SessionView } from './SessionView';

const { mockGraph } = vi.hoisted(() => ({
  mockGraph: {
    user_settings: { all: () => [{ $data: { view_template_category_expanded: {} } }] },
  },
}));

vi.mock('@/rowboat', () => ({
  useRowboat: () => mockGraph,
  useSelect: (fn: () => unknown) => fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  useSensors: () => [],
  useSensor: vi.fn(() => ({})),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

vi.mock('@/services/sessionService', () => ({
  updateViewMode: vi.fn(),
}));

vi.mock('@/services/userSettingsService', () => ({
  getTemplateAutocompleteDomain: vi.fn(() => 'grocery'),
  getTemplateAutoCategorizeEnabled: vi.fn(() => false),
}));

vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn(() => Promise.resolve(true)),
  }),
}));

const MIN = 60_000;
const START = new Date('2024-11-01T12:00:00').getTime();

function createMockItem(id: string, name: string) {
  return {
    id,
    name,
    path: name.toLowerCase(),
    type: 'item',
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    createdAt: START,
  };
}

function renderSession(itemStates: Record<string, ItemState>, selectedCount: number) {
  const checkedCount = Object.values(itemStates).filter((s) => s.checked).length;
  const session = {
    id: 'session-1',
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount,
    checkedCount,
    remainingCount: 0,
    createdAt: START,
    lastActivityAt: START,
  };
  const template = {
    id: 'template-1',
    owner_group_id: 'group-1',
    name: 'Test Template',
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items: [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')],
    sessions: [session],
    default_items: {},
    show_zone_headings: true,
    auto_categorize_enabled: false,
    autocomplete_domain: 'grocery',
  };
  render(
    <SessionView
      template={template as any}
      sessionId="session-1"
      onBack={vi.fn()}
      navState={{ view: 'session', templateId: 'template-1', sessionId: 'session-1' }}
      navigateTo={vi.fn()}
      goBack={vi.fn()}
    />,
  );
}

describe('SessionView completion time', () => {
  it('shows how long a completed session took', () => {
    renderSession(
      {
        'item-1': { selected: true, checked: true, checkedAt: START },
        'item-2': { selected: true, checked: true, checkedAt: START + 25 * MIN },
      },
      0,
    );
    expect(screen.getByText('Completed in 25 min')).toBeInTheDocument();
  });

  it('shows nothing while items are still to be checked', () => {
    renderSession(
      {
        'item-1': { selected: true, checked: true, checkedAt: START },
        'item-2': { selected: true, checked: false },
      },
      1,
    );
    expect(screen.queryByText(/Completed in/)).not.toBeInTheDocument();
  });
});
