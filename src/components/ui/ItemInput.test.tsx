/**
 * Tests for ItemInput component - existing item search integration
 *
 * Tests the autocomplete dropdown behavior when existingItems are provided,
 * including matching, sorting, visual differentiation, keyboard navigation,
 * and the onSelectExisting callback.
 */

import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExistingItem } from './ItemInput';
import { ItemInput } from './ItemInput';

// Mock useCategorization hook
const mockSetInput = vi.fn();
const mockClearSuggestions = vi.fn();
let mockSuggestions: Array<{
  text: string;
  category: string;
  categoryName: string;
  subcategory?: string;
  subcategoryName?: string;
  score: number;
  domain?: string;
}> = [];

vi.mock('@/lib/categorization', () => ({
  useCategorization: () => ({
    suggestions: mockSuggestions,
    setInput: mockSetInput,
    clearSuggestions: mockClearSuggestions,
    getCategoryDisplay: (s: { categoryName: string }) => s.categoryName,
  }),
}));

const existingItems: ExistingItem[] = [
  { id: 'item-1', name: 'Milk', isSelected: true },
  { id: 'item-2', name: 'Bread', isSelected: false },
  { id: 'item-3', name: 'Butter', isSelected: true },
  { id: 'item-4', name: 'Peanut Butter', isSelected: false },
  { id: 'item-5', name: 'Almond Milk', isSelected: false },
  { id: 'item-6', name: 'Buttermilk', isSelected: true },
];

describe('ItemInput - existing item search', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onSelectExisting: vi.fn(),
    existingItems,
    showTypeToggle: false,
    autoFocus: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSuggestions = [];
  });

  describe('matching logic', () => {
    it('does not show existing items when input is less than 2 chars', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'M');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows matching existing items when input is 2+ chars', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByText('Milk')).toBeInTheDocument();
      expect(within(listbox).getByText('Almond Milk')).toBeInTheDocument();
      expect(within(listbox).getByText('Buttermilk')).toBeInTheDocument();
    });

    it('does case-insensitive matching', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'MI');

      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByText('Milk')).toBeInTheDocument();
    });

    it('sorts starts-with matches before contains matches', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      const options = screen.getAllByRole('option');
      // "Milk" starts with "mi" so should come first
      expect(within(options[0]).getByText('Milk')).toBeInTheDocument();
      // "Almond Milk" and "Buttermilk" contain "mi" - alphabetical order
      expect(within(options[1]).getByText('Almond Milk')).toBeInTheDocument();
      expect(within(options[2]).getByText('Buttermilk')).toBeInTheDocument();
    });

    it('limits results to 5 existing items', async () => {
      const manyItems = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        name: `Test Item ${i}`,
        isSelected: false,
      }));
      render(<ItemInput {...defaultProps} existingItems={manyItems} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'te');

      const options = screen.getAllByRole('option');
      expect(options.length).toBeLessThanOrEqual(5);
    });

    it('shows no results for non-matching query', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'xyz');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not show existing items in category mode', async () => {
      render(<ItemInput {...defaultProps} showTypeToggle={true} />);
      const user = userEvent.setup();

      // Switch to category mode
      await user.click(screen.getByLabelText('Category'));
      const input = screen.getByRole('combobox');
      await user.type(input, 'mi');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('visual differentiation', () => {
    it('shows checkbox indicator for selected items', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      const listbox = screen.getByRole('listbox');
      // Milk is selected - should have a filled checkbox (green background)
      const milkOption = within(listbox).getByText('Milk').closest('button')!;
      const milkCheckbox = milkOption.querySelector('span:first-child')!;
      expect(milkCheckbox.className).toContain('bg-green-600');

      // Almond Milk is not selected - should have an empty checkbox
      const almondOption = within(listbox).getByText('Almond Milk').closest('button')!;
      const almondCheckbox = almondOption.querySelector('span:first-child')!;
      expect(almondCheckbox.className).toContain('border-neutral-300');
      expect(almondCheckbox.className).not.toContain('bg-green-600');
    });

    it('shows section headers when both existing items and dictionary suggestions are present', async () => {
      mockSuggestions = [
        { text: 'Miso Paste', category: 'asian', categoryName: 'Asian', score: 0.9 },
      ];

      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      expect(screen.getByText('In template')).toBeInTheDocument();
      expect(screen.getByText('Add new')).toBeInTheDocument();
    });

    it('does not show section headers when only existing items are present', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      expect(screen.queryByText('In template')).not.toBeInTheDocument();
      expect(screen.queryByText('Add new')).not.toBeInTheDocument();
    });

    it('does not show section headers when only dictionary suggestions are present', async () => {
      mockSuggestions = [
        { text: 'Xylitol', category: 'baking', categoryName: 'Baking', score: 0.9 },
      ];

      render(<ItemInput {...defaultProps} existingItems={[]} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'xy');

      expect(screen.queryByText('In template')).not.toBeInTheDocument();
      expect(screen.queryByText('Add new')).not.toBeInTheDocument();
    });
  });

  describe('selecting existing items', () => {
    it('calls onSelectExisting when clicking an existing item', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');
      await user.click(screen.getByText('Milk'));

      expect(defaultProps.onSelectExisting).toHaveBeenCalledWith('item-1');
    });

    it('clears input after selecting an existing item', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');
      await user.click(screen.getByText('Milk'));

      expect(input).toHaveValue('');
    });

    it('does not call onSubmit when selecting an existing item', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');
      await user.click(screen.getByText('Milk'));

      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('still calls onSubmit for new items via Enter key', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'New Item{Enter}');

      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Item', type: 'item' }),
      );
      expect(defaultProps.onSelectExisting).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation with existing items', () => {
    it('navigates through existing items with ArrowDown', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'bu');

      // Should show: Butter, Buttermilk, Peanut Butter (matching "bu")
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(3);

      await user.keyboard('{ArrowDown}');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      await user.keyboard('{ArrowDown}');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(options[0]).toHaveAttribute('aria-selected', 'false');
    });

    it('selects existing item with Enter when highlighted', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'bu');
      await user.keyboard('{ArrowDown}'); // Select first match (Butter)
      await user.keyboard('{Enter}');

      expect(defaultProps.onSelectExisting).toHaveBeenCalledWith('item-3'); // Butter's ID
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('navigates across existing items and dictionary suggestions', async () => {
      mockSuggestions = [{ text: 'Buns', category: 'bakery', categoryName: 'Bakery', score: 0.9 }];

      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'bu');

      // Existing items: Butter, Buttermilk, Peanut Butter + Dictionary: Buns
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(4);

      // Navigate to dictionary suggestion (index 3 = after 3 existing items)
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
      // Tab to select the dictionary suggestion
      await user.keyboard('{Tab}');

      // Should select the dictionary suggestion, not call onSelectExisting
      expect(defaultProps.onSelectExisting).not.toHaveBeenCalled();
      // Name should be filled with suggestion text
      expect(input).toHaveValue('Buns');
    });

    it('selects existing item with Tab when highlighted', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'bu');
      await user.keyboard('{ArrowDown}'); // Select first match
      await user.keyboard('{Tab}');

      expect(defaultProps.onSelectExisting).toHaveBeenCalledWith('item-3');
    });

    it('dismisses dropdown with Escape', async () => {
      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('combined dropdown capping', () => {
    it('caps dictionary suggestions when existing items are shown', async () => {
      mockSuggestions = [
        { text: 'Mint', category: 'herbs', categoryName: 'Herbs', score: 0.9 },
        { text: 'Miso', category: 'asian', categoryName: 'Asian', score: 0.8 },
        { text: 'Mirin', category: 'asian', categoryName: 'Asian', score: 0.7 },
        { text: 'Millet', category: 'grains', categoryName: 'Grains', score: 0.6 },
        { text: 'Mixed Nuts', category: 'snacks', categoryName: 'Snacks', score: 0.5 },
      ];

      render(<ItemInput {...defaultProps} />);
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'mi');

      // 3 existing matches (Milk, Almond Milk, Buttermilk) + capped suggestions (max 5 = 8-3)
      const options = screen.getAllByRole('option');
      expect(options.length).toBeLessThanOrEqual(8);
      // At least 3 existing items should be shown
      expect(within(screen.getByRole('listbox')).getByText('Milk')).toBeInTheDocument();
    });
  });

  describe('without existingItems prop', () => {
    it('works normally with only dictionary suggestions', async () => {
      mockSuggestions = [
        { text: 'Apples', category: 'produce', categoryName: 'Produce', score: 0.9 },
      ];

      render(
        <ItemInput {...defaultProps} existingItems={undefined} onSelectExisting={undefined} />,
      );
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');

      await user.type(input, 'ap');

      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByText('Apples')).toBeInTheDocument();
      expect(screen.queryByText('In template')).not.toBeInTheDocument();
    });
  });
});
