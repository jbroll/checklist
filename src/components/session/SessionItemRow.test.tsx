/**
 * Component tests for SessionItemRow
 *
 * Tests the item row rendering, checkbox interactions, and editing mode
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('can take focus programmatically without joining the tab order', () => {
      const { container } = render(<SessionItemRow {...defaultProps} zone="selected" />);

      const row = container.firstChild as HTMLElement;
      expect(row).toHaveAttribute('tabindex', '-1');
      row.focus();
      expect(row).toHaveFocus();
    });

    it('keeps tab order when the row is selectable', () => {
      const { container } = render(<SessionItemRow {...defaultProps} onSelectItem={vi.fn()} />);

      expect(container.firstChild).toHaveAttribute('tabindex', '0');
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

  describe('inline note editor', () => {
    const noteProps = {
      isNoteOpen: true,
      onEditNote: vi.fn(),
      onSaveNote: vi.fn(),
      onCancelNote: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('is not shown when the note is closed', () => {
      render(<SessionItemRow {...defaultProps} {...noteProps} isNoteOpen={false} />);

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('opens under the row with the template note in the available zone, focused', () => {
      const item = createMockItem('item-1', 'Milk', 'item', 'Buy organic');
      const { container } = render(
        <SessionItemRow {...defaultProps} {...noteProps} item={item} zone="available" />,
      );

      const textarea = screen.getByRole('textbox', { name: /template note for milk/i });
      expect(textarea).toHaveValue('Buy organic');
      expect(textarea).toHaveFocus();
      expect(textarea).toHaveAttribute('maxlength', '2000');
      expect(container.querySelector('[data-item-id]')?.contains(textarea)).toBe(false);
      expect(screen.queryByText('Template note:')).not.toBeInTheDocument();
    });

    it('edits the session note in the selected zone and shows the template note for reference', () => {
      const item = createMockItem('item-1', 'Milk', 'item', 'Buy organic');
      const state: ItemState = { selected: true, checked: false, notes: 'Two cartons' };
      render(
        <SessionItemRow
          {...defaultProps}
          {...noteProps}
          item={item}
          state={state}
          zone="selected"
        />,
      );

      expect(screen.getByRole('textbox', { name: /session note for milk/i })).toHaveValue(
        'Two cartons',
      );
      expect(screen.getByText('Template note:')).toBeInTheDocument();
      expect(screen.getAllByText('Buy organic').length).toBeGreaterThan(0);
    });

    it('saves the draft on Enter', async () => {
      const user = userEvent.setup();
      render(<SessionItemRow {...defaultProps} {...noteProps} />);

      await user.type(screen.getByRole('textbox'), 'Get two{Enter}');

      expect(noteProps.onSaveNote).toHaveBeenCalledOnce();
      expect(noteProps.onSaveNote).toHaveBeenCalledWith('Get two');
    });

    it('inserts a newline on Shift+Enter instead of saving', async () => {
      const user = userEvent.setup();
      render(<SessionItemRow {...defaultProps} {...noteProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'one{Shift>}{Enter}{/Shift}two');

      expect(textarea).toHaveValue('one\ntwo');
      expect(noteProps.onSaveNote).not.toHaveBeenCalled();
    });

    it('cancels on Escape without saving', async () => {
      const user = userEvent.setup();
      render(<SessionItemRow {...defaultProps} {...noteProps} />);

      await user.type(screen.getByRole('textbox'), 'draft{Escape}');
      await user.tab();

      expect(noteProps.onCancelNote).toHaveBeenCalledOnce();
      expect(noteProps.onSaveNote).not.toHaveBeenCalled();
    });

    it('saves on blur', async () => {
      const user = userEvent.setup();
      render(<SessionItemRow {...defaultProps} {...noteProps} />);

      await user.type(screen.getByRole('textbox'), 'blurred');
      await user.tab();

      expect(noteProps.onSaveNote).toHaveBeenCalledOnce();
      expect(noteProps.onSaveNote).toHaveBeenCalledWith('blurred');
    });

    it('saves once and does not reopen when the note icon is clicked on the open row', async () => {
      const user = userEvent.setup();
      render(<SessionItemRow {...defaultProps} {...noteProps} />);

      await user.type(screen.getByRole('textbox'), 'closing');
      await user.click(screen.getByRole('button', { name: /edit template note/i }));

      expect(noteProps.onSaveNote).toHaveBeenCalledOnce();
      expect(noteProps.onSaveNote).toHaveBeenCalledWith('closing');
      expect(noteProps.onEditNote).not.toHaveBeenCalled();
    });

    it('does not select the row while typing in the note', async () => {
      const user = userEvent.setup();
      const onSelectItem = vi.fn();
      render(<SessionItemRow {...defaultProps} {...noteProps} onSelectItem={onSelectItem} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);
      await user.type(textarea, ' x');

      expect(onSelectItem).not.toHaveBeenCalled();
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
