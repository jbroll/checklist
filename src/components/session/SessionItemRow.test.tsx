/**
 * Component tests for SessionItemRow
 *
 * Tests the item row rendering, checkbox interactions, and editing mode
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ItemState, TemplateItem } from '@/schema/folder';
import { SessionItemRow } from './SessionItemRow';

// Mock the rowboat graph hook — SessionItemRow only threads it through to
// templateService.renameItem, which isn't exercised by these tests.
vi.mock('@/rowboat', () => ({
  useRowboat: () => ({}),
}));

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

// Helper to create mock items
function createMockItem(
  id: string,
  name: string,
  type: 'item' | 'category' = 'item',
  notes?: string,
): TemplateItem {
  return {
    id,
    name,
    path: name.toLowerCase(),
    type,
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    notes,
    createdAt: Date.now(),
  } as TemplateItem;
}

// Default props
const defaultProps = {
  item: createMockItem('item-1', 'Test Item'),
  state: null as ItemState | null,
  zone: 'available' as const,
  onToggleSelected: vi.fn(),
  onToggleChecked: vi.fn(),
};

describe('SessionItemRow', () => {
  describe('rendering', () => {
    it('renders item name', () => {
      render(<SessionItemRow {...defaultProps} />);

      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('does not render category items', () => {
      const categoryItem = createMockItem('cat-1', 'Category', 'category');
      const { container } = render(<SessionItemRow {...defaultProps} item={categoryItem} />);

      expect(container.firstChild).toBeNull();
    });

    it('renders default quantity when provided', () => {
      const item = { ...createMockItem('item-1', 'Milk'), defaultQuantity: '2L' } as TemplateItem;
      render(<SessionItemRow {...defaultProps} item={item} />);

      expect(screen.getByText('(2L)')).toBeInTheDocument();
    });

    it('renders template notes when in available zone', () => {
      const item = createMockItem('item-1', 'Milk', 'item', 'Buy organic');
      render(
        <SessionItemRow {...defaultProps} item={item} zone="available" onEditNote={vi.fn()} />,
      );

      expect(screen.getByText('Buy organic')).toBeInTheDocument();
    });

    it('renders session notes when in selected zone', () => {
      const state: ItemState = {
        selected: true,
        checked: false,
        notes: 'Session specific note',
      };
      render(
        <SessionItemRow {...defaultProps} state={state} zone="selected" onEditNote={vi.fn()} />,
      );

      expect(screen.getByText('Session specific note')).toBeInTheDocument();
    });

    it('applies strikethrough style when item is checked', () => {
      const state: ItemState = {
        selected: true,
        checked: true,
      };
      render(<SessionItemRow {...defaultProps} state={state} zone="checked" />);

      const itemText = screen.getByText('Test Item');
      expect(itemText).toHaveClass('line-through');
    });
  });

  describe('checkbox interactions - available zone', () => {
    it('calls onToggleSelected when checkbox clicked in available zone', async () => {
      const user = userEvent.setup();
      const onToggleSelected = vi.fn();

      render(<SessionItemRow {...defaultProps} onToggleSelected={onToggleSelected} />);

      const checkbox = screen.getByRole('button', { name: /add test item to list/i });
      await user.click(checkbox);

      expect(onToggleSelected).toHaveBeenCalledWith('item-1');
    });

    it('shows unchecked state when item not selected', () => {
      render(<SessionItemRow {...defaultProps} />);

      const checkbox = screen.getByRole('button', { name: /add test item to list/i });
      expect(checkbox).not.toHaveTextContent('Selected');
    });

    it('shows checked state when item is selected', () => {
      const state: ItemState = { selected: true, checked: false };
      render(<SessionItemRow {...defaultProps} state={state} />);

      const checkbox = screen.getByRole('button', { name: /remove test item from list/i });
      expect(checkbox.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('checkbox interactions - selected zone', () => {
    it('calls onToggleChecked when checkbox clicked in selected zone', async () => {
      const user = userEvent.setup();
      const onToggleChecked = vi.fn();
      const state: ItemState = { selected: true, checked: false };

      render(
        <SessionItemRow
          {...defaultProps}
          state={state}
          zone="selected"
          onToggleChecked={onToggleChecked}
        />,
      );

      const checkbox = screen.getByRole('button', { name: /mark test item as checked/i });
      await user.click(checkbox);

      expect(onToggleChecked).toHaveBeenCalledWith('item-1');
    });
  });

  describe('delete functionality', () => {
    it('shows delete button when showDeleteIcon is true in available zone', () => {
      render(<SessionItemRow {...defaultProps} showDeleteIcon={true} onDeleteItem={vi.fn()} />);

      expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
    });

    it('does not show delete button when showDeleteIcon is false', () => {
      render(<SessionItemRow {...defaultProps} showDeleteIcon={false} />);

      expect(screen.queryByRole('button', { name: /delete item/i })).not.toBeInTheDocument();
    });

    it('calls onDeleteItem when delete button clicked', async () => {
      const user = userEvent.setup();
      const onDeleteItem = vi.fn();

      render(
        <SessionItemRow {...defaultProps} showDeleteIcon={true} onDeleteItem={onDeleteItem} />,
      );

      await user.click(screen.getByRole('button', { name: /delete item/i }));

      expect(onDeleteItem).toHaveBeenCalledWith('item-1');
    });

    it('shows deselect button in selected zone', () => {
      const state: ItemState = { selected: true, checked: false };

      render(<SessionItemRow {...defaultProps} state={state} zone="selected" />);

      expect(screen.getByRole('button', { name: /deselect item/i })).toBeInTheDocument();
    });

    it('calls onToggleSelected when deselect button clicked', async () => {
      const user = userEvent.setup();
      const onToggleSelected = vi.fn();
      const state: ItemState = { selected: true, checked: false };

      render(
        <SessionItemRow
          {...defaultProps}
          state={state}
          zone="selected"
          onToggleSelected={onToggleSelected}
        />,
      );

      await user.click(screen.getByRole('button', { name: /deselect item/i }));

      expect(onToggleSelected).toHaveBeenCalledWith('item-1');
    });
  });

  describe('selection for insertion', () => {
    it('highlights row when selected for insertion', () => {
      const { container } = render(
        <SessionItemRow {...defaultProps} isSelected={true} onSelectItem={vi.fn()} />,
      );

      const row = container.firstChild as HTMLElement;
      expect(row).toHaveClass('bg-interactive-active');
    });

    it('calls onSelectItem when row clicked', async () => {
      const user = userEvent.setup();
      const onSelectItem = vi.fn();

      render(<SessionItemRow {...defaultProps} isSelected={false} onSelectItem={onSelectItem} />);

      await user.click(screen.getByText('Test Item'));

      expect(onSelectItem).toHaveBeenCalledWith('item-1');
    });

    it('deselects when already selected row is clicked', async () => {
      const user = userEvent.setup();
      const onSelectItem = vi.fn();

      render(<SessionItemRow {...defaultProps} isSelected={true} onSelectItem={onSelectItem} />);

      await user.click(screen.getByText('Test Item'));

      expect(onSelectItem).toHaveBeenCalledWith(null);
    });
  });

  describe('notes icon', () => {
    it('shows notes icon when onEditNote is provided', () => {
      render(<SessionItemRow {...defaultProps} onEditNote={vi.fn()} />);

      expect(screen.getByRole('button', { name: /edit template note/i })).toBeInTheDocument();
    });

    it('hides notes icon when showNotesIcon is false', () => {
      render(<SessionItemRow {...defaultProps} onEditNote={vi.fn()} showNotesIcon={false} />);

      expect(screen.queryByRole('button', { name: /edit.*note/i })).not.toBeInTheDocument();
    });

    it('calls onEditNote when notes icon clicked', async () => {
      const user = userEvent.setup();
      const onEditNote = vi.fn();

      render(<SessionItemRow {...defaultProps} onEditNote={onEditNote} />);

      await user.click(screen.getByRole('button', { name: /edit template note/i }));

      expect(onEditNote).toHaveBeenCalledWith('item-1');
    });

    it('shows session note label in selected zone', () => {
      const state: ItemState = { selected: true, checked: false };

      render(
        <SessionItemRow {...defaultProps} state={state} zone="selected" onEditNote={vi.fn()} />,
      );

      expect(screen.getByRole('button', { name: /edit session note/i })).toBeInTheDocument();
    });
  });

  describe('disabled state during edit/drag', () => {
    it('disables checkbox when isAnyItemBeingEditedOrDragged is true', async () => {
      const user = userEvent.setup();
      const onToggleSelected = vi.fn();

      render(
        <SessionItemRow
          {...defaultProps}
          onToggleSelected={onToggleSelected}
          isAnyItemBeingEditedOrDragged={true}
        />,
      );

      const checkbox = screen.getByRole('button', { name: /add test item to list/i });
      expect(checkbox).toBeDisabled();

      await user.click(checkbox);
      expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it('disables delete button when isAnyItemBeingEditedOrDragged is true', async () => {
      const user = userEvent.setup();
      const onDeleteItem = vi.fn();

      render(
        <SessionItemRow
          {...defaultProps}
          showDeleteIcon={true}
          onDeleteItem={onDeleteItem}
          isAnyItemBeingEditedOrDragged={true}
        />,
      );

      const deleteBtn = screen.getByRole('button', { name: /delete item/i });
      expect(deleteBtn).toBeDisabled();

      await user.click(deleteBtn);
      expect(onDeleteItem).not.toHaveBeenCalled();
    });

    it('disables notes icon when isAnyItemBeingEditedOrDragged is true', async () => {
      const user = userEvent.setup();
      const onEditNote = vi.fn();

      render(
        <SessionItemRow
          {...defaultProps}
          onEditNote={onEditNote}
          isAnyItemBeingEditedOrDragged={true}
        />,
      );

      const notesBtn = screen.getByRole('button', { name: /edit template note/i });
      expect(notesBtn).toBeDisabled();

      await user.click(notesBtn);
      expect(onEditNote).not.toHaveBeenCalled();
    });
  });
});
