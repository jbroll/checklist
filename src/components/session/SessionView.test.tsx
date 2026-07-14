/**
 * Component tests for SessionView
 *
 * Tests rendering, item interactions, zone partitioning, view modes, and edit mode.
 * Uses jazz-mock for CoValue mocking.
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionView } from './SessionView';

// TODO(slice-2): SessionView still reads a Jazz FolderNode/session; this whole file is
// skip-pending until sessions land on rowboat (see docs/superpowers/d-t4-report.md). Local
// replacement for the old jazz-mock `createMockCoMap` helper — good enough shape for a
// skipped suite, no jazz-mock dependency required.
function createMockCoMap<T extends object>(data: T, options: { id?: string } = {}) {
  return { ...data, $jazz: { id: options.id ?? 'mock', set: () => {} } };
}

// Mock Jazz hooks
const mockAccount = {
  id: 'test-account',
  root: {
    viewState: {
      templateCategoryExpanded: {},
    },
  },
};

vi.mock('@/lib/jazz', () => ({
  useAccount: () => mockAccount,
}));

// Mock navigation history hook
const mockNavigateTo = vi.fn();
const mockGoBack = vi.fn();
let mockNavState = { view: 'session' as const, editing: false };
vi.mock('@/lib/useNavigationHistory', () => ({
  useNavigationHistory: () => ({
    get navState() {
      return mockNavState;
    },
    navigateTo: mockNavigateTo,
    goBack: mockGoBack,
  }),
}));

// Mock dnd-kit
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

// Mock session service
vi.mock('@/services/sessionService', () => ({
  updateViewMode: vi.fn(),
}));

// Mock template service
vi.mock('@/services/templateService', () => ({
  renameItem: vi.fn(),
}));

// Mock dialog context
vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn(() => Promise.resolve(true)),
  }),
}));

// Helper to create mock item
function createMockItem(id: string, name: string, type: 'item' | 'category' = 'item', path = '') {
  return {
    id,
    name,
    path: path || name.toLowerCase(),
    type,
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    createdAt: new Date(),
  };
}

// Helper to create mock template using jazz-mock
function createMockTemplate(id: string, items: any[] = [], sessions: any[] = []) {
  return createMockCoMap(
    {
      name: 'Test Template',
      items,
      sessions,
      showZoneHeadings: true,
      autocompleteDomain: 'grocery',
      createdAt: new Date(),
      updatedAt: new Date(),
      $jazz: { id },
    },
    { id, trackMutations: true },
  );
}

// Helper to create mock session
function createMockSession(
  id: string,
  itemStates: Record<string, any> = {},
  viewMode: 'flat' | 'zone-in-hierarchy' = 'zone-in-hierarchy',
) {
  return {
    id,
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode,
    selectedCount: Object.values(itemStates).filter((s: any) => s.selected).length,
    checkedCount: Object.values(itemStates).filter((s: any) => s.checked).length,
    remainingCount: 0,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };
}

// Default props for SessionView
function createDefaultProps(overrides = {}) {
  const items = [
    createMockItem('item-1', 'Milk', 'item'),
    createMockItem('item-2', 'Bread', 'item'),
  ];
  const session = createMockSession('session-1');
  const template = createMockTemplate('template-1', items, [session]);

  return {
    template,
    sessionId: 'session-1',
    onBack: vi.fn(),
    onSwitchSession: vi.fn(),
    ...overrides,
  };
}

describe.skip('SessionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset account state
    if (mockAccount.root) {
      mockAccount.root.viewState = {
        templateCategoryExpanded: {},
      };
    }
    // Reset navigation state
    mockNavState = { view: 'session', editing: false };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders session with items in empty state', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      expect(screen.getByText('Test Template')).toBeInTheDocument();
      expect(screen.getByText('No items selected for this session.')).toBeInTheDocument();
    });

    it('shows empty state when no items selected or checked', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      expect(screen.getByText('No items selected for this session.')).toBeInTheDocument();
      expect(screen.getByText('Edit to select default items')).toBeInTheDocument();
    });

    it('renders session header with template name', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      expect(screen.getByText('Test Template')).toBeInTheDocument();
    });

    it('shows loading state when account is not ready', () => {
      const originalAccount = mockAccount.root;
      mockAccount.root = null as any;

      const props = createDefaultProps();
      render(<SessionView {...props} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      mockAccount.root = originalAccount;
    });

    it('shows error when session not found', () => {
      const items = [createMockItem('item-1', 'Milk', 'item')];
      const template = createMockTemplate('template-1', items, []);
      const props = createDefaultProps({ template, sessionId: 'non-existent' });

      render(<SessionView {...props} />);

      expect(screen.getByText('Session not found')).toBeInTheDocument();
      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });
  });

  describe('zones', () => {
    it('renders selected zone with selected items', () => {
      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // In zone-in-hierarchy mode, selected items appear in their categories
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    it('renders checked zone with checked items', () => {
      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: true },
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    it('partitions items into correct zones', () => {
      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
        createMockItem('item-3', 'Eggs', 'item'),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
        'item-2': { selected: true, checked: true },
        // item-3 is unselected
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // All items should be visible (selected and checked)
      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });
  });

  describe('view modes', () => {
    it('renders in zone-in-hierarchy view mode by default', () => {
      const items = [createMockItem('item-1', 'Milk', 'item')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Verify zone-in-hierarchy view is rendered
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    it('renders in flat view mode when session has flat viewMode', () => {
      const items = [createMockItem('item-1', 'Milk', 'item')];
      const session = createMockSession(
        'session-1',
        {
          'item-1': { selected: true, checked: false },
        },
        'flat',
      );
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Verify flat view is rendered (items appear in flat list)
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    it('switches between view modes when cycling', async () => {
      const user = userEvent.setup();
      const items = [createMockItem('item-1', 'Milk', 'item')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Find and click view mode toggle button (aria-label is "Switch to X view")
      const viewModeButton = screen.getByLabelText(/switch to .* view/i);
      await user.click(viewModeButton);

      // Verify session service was called
      const sessionService = await import('@/services/sessionService');
      expect(sessionService.updateViewMode).toHaveBeenCalledWith(
        mockAccount,
        'template-1',
        'session-1',
        'flat',
      );
    });
  });

  describe('edit mode', () => {
    it('enters edit mode when edit button is clicked', async () => {
      const user = userEvent.setup();
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      // Click "Edit to select default items" button
      const editButton = screen.getByText('Edit to select default items');
      await user.click(editButton);

      expect(mockNavigateTo).toHaveBeenCalledWith({
        view: 'session',
        templateId: 'template-1',
        sessionId: 'session-1',
        editing: true,
      });
    });

    it('shows all items in edit mode', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
      ];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Should show "Default Items" heading
      expect(screen.getByText('Default Items')).toBeInTheDocument();
      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    it('shows add item form in edit mode', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const props = createDefaultProps();
      render(<SessionView {...props} />);

      // Should have add item input (placeholder is "Item name...")
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument();
    });

    it('exits edit mode when back is triggered', async () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const props = createDefaultProps();
      render(<SessionView {...props} />);

      // Click the "Done" button to exit edit mode
      const doneButton = screen.getByText('Done');
      const user = userEvent.setup();
      await user.click(doneButton);

      expect(mockGoBack).toHaveBeenCalled();
    });

    it('shows empty state in edit mode when no items', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const template = createMockTemplate('template-1', [], [createMockSession('session-1')]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      expect(screen.getByText('No items in this list yet.')).toBeInTheDocument();
    });
  });

  describe('item interactions', () => {
    it('allows toggling item selection', async () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const items = [createMockItem('item-1', 'Milk', 'item')];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // In edit mode, items are shown with action buttons
      // Verify the item name is displayed
      expect(screen.getByText('Milk')).toBeInTheDocument();

      // Verify item row action buttons exist (they use buttons, not checkboxes)
      const actionButtons = screen.getAllByRole('button');
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('shows hierarchical items when categories exist', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const items = [
        createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
        createMockItem('item-1', 'Milk', 'item', 'dairy\x01milk'),
      ];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Category should be visible
      expect(screen.getByText('Dairy')).toBeInTheDocument();
    });
  });

  describe('session header', () => {
    it('displays template name in header', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      expect(screen.getByText('Test Template')).toBeInTheDocument();
    });

    it('calls onBack when back button is clicked', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      const props = createDefaultProps({ onBack });

      render(<SessionView {...props} />);

      // The "Done" button in the header calls onBack
      const doneButton = screen.getByRole('button', { name: 'Done' });
      await user.click(doneButton);

      expect(onBack).toHaveBeenCalled();
    });
  });

  describe('batch operations', () => {
    it('shows batch operation buttons in edit mode', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
      ];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Batch operation buttons should be present (by icon class)
      expect(document.querySelector('.lucide-list-checks')).toBeInTheDocument();
      expect(document.querySelector('.lucide-list-x')).toBeInTheDocument();
      expect(document.querySelector('.lucide-list-minus')).toBeInTheDocument();
    });
  });

  describe('drag and drop', () => {
    it('wraps content in DndContext', () => {
      const props = createDefaultProps();
      const { container } = render(<SessionView {...props} />);

      // DndContext should be rendered (our mock renders a div)
      expect(container.querySelector('div')).toBeInTheDocument();
    });
  });

  describe('scroll preservation', () => {
    it('maintains scroll position when items change', () => {
      const items = [
        createMockItem('item-1', 'Milk', 'item'),
        createMockItem('item-2', 'Bread', 'item'),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      const { container } = render(<SessionView {...props} />);

      // Scroll container should be present
      const scrollContainer = container.querySelector('[style*="scroll-behavior"]');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('note editor', () => {
    it('does not show note editor dialog by default', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      // Note editor should not be visible
      expect(screen.queryByText(/note editor/i)).not.toBeInTheDocument();
    });
  });

  describe('category expansion state', () => {
    it('uses category expanded state from account viewState', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      mockAccount.root.viewState.templateCategoryExpanded = {
        'template-1': {
          'cat-1': false,
        },
      };

      const items = [
        createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
        createMockItem('item-1', 'Milk', 'item', 'dairy\x01milk'),
      ];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Category should be rendered
      expect(screen.getByText('Dairy')).toBeInTheDocument();
    });

    it('defaults to expanded when no viewState exists', () => {
      // Set navigation state to show edit mode
      mockNavState = { view: 'session', editing: true };

      mockAccount.root.viewState.templateCategoryExpanded = {};

      const items = [
        createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
        createMockItem('item-1', 'Milk', 'item', 'dairy\x01milk'),
      ];
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', items, [session]);
      const props = createDefaultProps({ template });

      render(<SessionView {...props} />);

      // Category should be rendered (and expanded by default)
      expect(screen.getByText('Dairy')).toBeInTheDocument();
    });
  });

  describe('session switching', () => {
    it('passes onSwitchSession to handlers', () => {
      const onSwitchSession = vi.fn();
      const props = createDefaultProps({ onSwitchSession });

      render(<SessionView {...props} />);

      // onSwitchSession should be available in the component
      expect(props.onSwitchSession).toBe(onSwitchSession);
    });
  });

  describe('clear/new session', () => {
    it('shows clear/new button in header', () => {
      const props = createDefaultProps();
      render(<SessionView {...props} />);

      // "New" button should be in header
      const newButton = screen.getByRole('button', { name: 'New' });
      expect(newButton).toBeInTheDocument();
    });
  });
});
