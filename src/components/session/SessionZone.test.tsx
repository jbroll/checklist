/**
 * Component tests for SessionZone
 *
 * Tests the zone rendering, batch operations, and interaction modes
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Package } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SessionZone } from './SessionZone';

// Mock the Jazz hook
vi.mock('@/lib/jazz', () => ({
  useAccount: () => ({
    id: 'test-account',
    root: { folders: [] },
  }),
}));

// Helper to create mock items
function createMockItem(id: string, name: string, type: 'item' | 'category' = 'item') {
  return {
    id,
    name,
    path: name.toLowerCase(),
    type,
    sortOrder: 0,
    archived: false,
    expanded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Minimal props for SessionZone
const defaultProps = {
  items: [],
  itemStates: {},
  expanded: true,
  onToggleExpand: vi.fn(),
  zoneConfig: {
    title: 'Test Zone',
    zone: 'available' as const,
  },
  itemActions: {
    onToggleSelected: vi.fn(),
    onToggleChecked: vi.fn(),
  },
};

describe('SessionZone', () => {
  describe('rendering', () => {
    it('renders zone title', () => {
      render(<SessionZone {...defaultProps} />);

      expect(screen.getByText('Test Zone')).toBeInTheDocument();
    });

    it('renders with icon when provided', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            icon: Package,
          }}
        />,
      );

      // Icon should be rendered (Package icon has a specific SVG)
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders item count when provided', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            count: 5,
          }}
          items={[createMockItem('1', 'Item 1'), createMockItem('2', 'Item 2')]}
        />,
      );

      // Should show "X of Y" format
      expect(screen.getByText(/of/)).toBeInTheDocument();
    });

    it('hides heading when showHeading is false', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            showHeading: false,
          }}
        />,
      );

      expect(screen.queryByText('Test Zone')).not.toBeInTheDocument();
    });

    it('renders children when provided', () => {
      render(
        <SessionZone {...defaultProps}>
          <div data-testid="child-content">Child Content</div>
        </SessionZone>,
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });

  describe('expand/collapse', () => {
    it('calls onToggleExpand when expand button is clicked', async () => {
      const user = userEvent.setup();
      const onToggleExpand = vi.fn();

      render(
        <SessionZone
          {...defaultProps}
          onToggleExpand={onToggleExpand}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      // Find and click the expand/collapse button
      const expandButton = screen.getByRole('button', { name: /expand|collapse/i });
      await user.click(expandButton);

      expect(onToggleExpand).toHaveBeenCalled();
    });

    it('hides content when collapsed', () => {
      render(
        <SessionZone {...defaultProps} expanded={false}>
          <div data-testid="zone-content">Content</div>
        </SessionZone>,
      );

      expect(screen.queryByTestId('zone-content')).not.toBeInTheDocument();
    });

    it('shows content when expanded', () => {
      render(
        <SessionZone {...defaultProps} expanded={true}>
          <div data-testid="zone-content">Content</div>
        </SessionZone>,
      );

      expect(screen.getByTestId('zone-content')).toBeInTheDocument();
    });
  });

  describe('batch operations', () => {
    // Helper to find batch buttons by their icon class
    const findSelectAllButton = () =>
      document.querySelector('.lucide-list-checks')?.closest('button');
    const findToggleButton = () => document.querySelector('.lucide-list-minus')?.closest('button');
    const findDeselectAllButton = () => document.querySelector('.lucide-list-x')?.closest('button');

    it('shows batch buttons in available zone', () => {
      const onBatchSelectAll = vi.fn();
      const onBatchDeselectAll = vi.fn();
      const onBatchToggle = vi.fn();

      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            zone: 'available',
          }}
          batchActions={{
            onBatchSelectAll,
            onBatchDeselectAll,
            onBatchToggle,
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      // Should have three batch operation buttons (found by icon class)
      expect(findSelectAllButton()).toBeInTheDocument();
      expect(findToggleButton()).toBeInTheDocument();
      expect(findDeselectAllButton()).toBeInTheDocument();
    });

    it('does not show batch buttons in selected zone', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            zone: 'selected',
          }}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll: vi.fn(),
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      expect(findSelectAllButton()).toBeFalsy();
    });

    it('does not show batch buttons in checked zone', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            zone: 'checked',
          }}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll: vi.fn(),
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      expect(findSelectAllButton()).toBeFalsy();
    });

    it('calls onBatchSelectAll when select all button clicked', async () => {
      const user = userEvent.setup();
      const onBatchSelectAll = vi.fn();

      render(
        <SessionZone
          {...defaultProps}
          batchActions={{
            onBatchSelectAll,
            onBatchDeselectAll: vi.fn(),
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      const selectAllBtn = findSelectAllButton();
      expect(selectAllBtn).toBeInTheDocument();
      await user.click(selectAllBtn as HTMLElement);

      expect(onBatchSelectAll).toHaveBeenCalledWith(['1']);
    });

    it('calls onBatchDeselectAll when deselect all button clicked', async () => {
      const user = userEvent.setup();
      const onBatchDeselectAll = vi.fn();

      render(
        <SessionZone
          {...defaultProps}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll,
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
          itemStates={{
            '1': { selected: true, checked: false },
          }}
        />,
      );

      const deselectAllBtn = findDeselectAllButton();
      expect(deselectAllBtn).toBeInTheDocument();
      await user.click(deselectAllBtn as HTMLElement);

      expect(onBatchDeselectAll).toHaveBeenCalledWith(['1']);
    });

    it('calls onBatchToggle when toggle button clicked', async () => {
      const user = userEvent.setup();
      const onBatchToggle = vi.fn();

      render(
        <SessionZone
          {...defaultProps}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll: vi.fn(),
            onBatchToggle,
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      const toggleBtn = findToggleButton();
      expect(toggleBtn).toBeInTheDocument();
      await user.click(toggleBtn as HTMLElement);

      expect(onBatchToggle).toHaveBeenCalledWith(['1']);
    });

    it('disables select all when all items are selected', () => {
      render(
        <SessionZone
          {...defaultProps}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll: vi.fn(),
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
          itemStates={{
            '1': { selected: true, checked: false },
          }}
        />,
      );

      expect(findSelectAllButton()).toBeDisabled();
    });

    it('disables deselect all when no items are selected', () => {
      render(
        <SessionZone
          {...defaultProps}
          batchActions={{
            onBatchSelectAll: vi.fn(),
            onBatchDeselectAll: vi.fn(),
            onBatchToggle: vi.fn(),
          }}
          items={[createMockItem('1', 'Item 1')]}
          itemStates={{}}
        />,
      );

      expect(findDeselectAllButton()).toBeDisabled();
    });
  });

  describe('checked vs selected count', () => {
    it('displays checkedVsSelectedCount when provided', () => {
      render(
        <SessionZone
          {...defaultProps}
          zoneConfig={{
            ...defaultProps.zoneConfig,
            count: 5,
            checkedVsSelectedCount: { checked: 2, selected: 5 },
          }}
          items={[createMockItem('1', 'Item 1')]}
        />,
      );

      expect(screen.getByText('2 of 5')).toBeInTheDocument();
    });
  });

  describe('delete functionality', () => {
    it('shows delete button when showDeleteIcon is true and categoryItem provided', () => {
      const categoryItem = createMockItem('cat-1', 'Category', 'category');

      render(
        <SessionZone
          {...defaultProps}
          itemActions={{
            ...defaultProps.itemActions,
            showDeleteIcon: true,
            onDeleteItem: vi.fn(),
          }}
          categorySelection={{
            categoryItem,
          }}
        />,
      );

      expect(screen.getByLabelText('Delete category')).toBeInTheDocument();
    });

    it('calls onDeleteItem when delete button clicked', async () => {
      const user = userEvent.setup();
      const onDeleteItem = vi.fn();
      const categoryItem = createMockItem('cat-1', 'Category', 'category');

      render(
        <SessionZone
          {...defaultProps}
          itemActions={{
            ...defaultProps.itemActions,
            showDeleteIcon: true,
            onDeleteItem,
          }}
          categorySelection={{
            categoryItem,
          }}
        />,
      );

      await user.click(screen.getByLabelText('Delete category'));

      expect(onDeleteItem).toHaveBeenCalledWith('cat-1');
    });
  });

  describe('category selection', () => {
    it('highlights when category is selected', () => {
      const categoryItem = createMockItem('cat-1', 'Category', 'category');

      const { container } = render(
        <SessionZone
          {...defaultProps}
          categorySelection={{
            categoryItem,
            isSelected: true,
            onSelectItem: vi.fn(),
          }}
        />,
      );

      // Should have the active background class
      const selectableDiv = container.querySelector('.bg-interactive-active');
      expect(selectableDiv).toBeInTheDocument();
    });

    it('calls onSelectItem when category clicked', async () => {
      const user = userEvent.setup();
      const onSelectItem = vi.fn();
      const categoryItem = createMockItem('cat-1', 'Category', 'category');

      render(
        <SessionZone
          {...defaultProps}
          categorySelection={{
            categoryItem,
            isSelected: false,
            onSelectItem,
          }}
        />,
      );

      // Click on the title area
      await user.click(screen.getByText('Test Zone'));

      expect(onSelectItem).toHaveBeenCalledWith('cat-1');
    });

    it('deselects when already selected category is clicked', async () => {
      const user = userEvent.setup();
      const onSelectItem = vi.fn();
      const categoryItem = createMockItem('cat-1', 'Category', 'category');

      render(
        <SessionZone
          {...defaultProps}
          categorySelection={{
            categoryItem,
            isSelected: true,
            onSelectItem,
          }}
        />,
      );

      await user.click(screen.getByText('Test Zone'));

      expect(onSelectItem).toHaveBeenCalledWith(null);
    });
  });
});
