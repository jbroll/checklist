import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavState } from '@/lib/useNavigationHistory';
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
  toggleItemChecked: vi.fn(),
  updateSessionItemNotes: vi.fn(),
}));

vi.mock('@/services/templateService', () => ({
  renameItem: vi.fn(),
  updateItemNotes: vi.fn(),
}));

vi.mock('@/services/viewStateService', () => ({
  toggleTemplateCategoryExpanded: vi.fn(),
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

import * as sessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';

const mockNavigateTo = vi.fn();

function createMockItem(id: string, name: string, notes?: string) {
  return {
    id,
    name,
    path: name.toLowerCase(),
    type: 'item',
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    notes,
    createdAt: Date.now(),
  };
}

function renderWithSelectedItems(editing = false) {
  const itemStates = {
    'item-1': { selected: true, checked: false, notes: 'Two cartons' },
    'item-2': { selected: true, checked: false },
  };
  const session = {
    id: 'session-1',
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 2,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
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
    items: [createMockItem('item-1', 'Milk', 'Organic only'), createMockItem('item-2', 'Bread')],
    sessions: [session],
    default_items: {},
    show_zone_headings: true,
    auto_categorize_enabled: false,
    autocomplete_domain: 'grocery',
  };
  const navState: NavState = {
    view: 'session',
    templateId: 'template-1',
    sessionId: 'session-1',
    editing,
  };
  const onBack = vi.fn();
  render(
    <SessionView
      template={template as any}
      sessionId="session-1"
      onBack={onBack}
      navState={navState}
      navigateTo={mockNavigateTo}
      goBack={vi.fn()}
    />,
  );
  return { onBack };
}

function noteButtonFor(itemName: string) {
  const row = screen.getByText(itemName).closest<HTMLElement>('[data-item-id]');
  if (!row) throw new Error(`no row for ${itemName}`);
  return within(row).getByRole('button', { name: /edit .*note/i });
}

describe('SessionView inline note editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is closed by default', () => {
    renderWithSelectedItems();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the session note inline and saves it on Enter', async () => {
    const user = userEvent.setup();
    renderWithSelectedItems();

    await user.click(noteButtonFor('Milk'));

    const textarea = screen.getByRole('textbox', { name: /session note for milk/i });
    expect(textarea).toHaveValue('Two cartons');
    expect(textarea).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, ' Three cartons {Enter}');

    expect(sessionService.updateSessionItemNotes).toHaveBeenCalledWith(
      mockGraph,
      'template-1',
      'session-1',
      'item-1',
      'Three cartons',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps only one note editor open at a time', async () => {
    const user = userEvent.setup();
    renderWithSelectedItems();

    await user.click(noteButtonFor('Milk'));
    await user.click(noteButtonFor('Bread'));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: /session note for bread/i })).toBeInTheDocument();
  });

  it('closes the editor when its note icon is clicked again', async () => {
    const user = userEvent.setup();
    renderWithSelectedItems();

    await user.click(noteButtonFor('Milk'));
    await user.click(noteButtonFor('Milk'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not fire session shortcuts while typing in the note', async () => {
    const user = userEvent.setup();
    const { onBack } = renderWithSelectedItems();

    await user.click(noteButtonFor('Milk'));
    await user.type(screen.getByRole('textbox'), 'n {Escape}');

    expect(mockNavigateTo).not.toHaveBeenCalled();
    expect(sessionService.toggleItemChecked).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(sessionService.updateSessionItemNotes).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('edits the template note inline in edit mode', async () => {
    const user = userEvent.setup();
    renderWithSelectedItems(true);

    await user.click(noteButtonFor('Milk'));

    const textarea = screen.getByRole('textbox', { name: /template note for milk/i });
    expect(textarea).toHaveValue('Organic only');
    expect(textarea).toHaveFocus();

    await user.type(textarea, ', please{Enter}');

    expect(templateService.updateItemNotes).toHaveBeenCalledWith(
      mockGraph,
      'template-1',
      'item-1',
      'Organic only, please',
    );
  });
});
