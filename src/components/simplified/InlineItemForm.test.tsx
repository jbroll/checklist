import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineItemForm } from './InlineItemForm';

describe('InlineItemForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render input field and radio buttons', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    expect(screen.getByPlaceholderText(/enter item or category name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^item$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  });

  it('should focus input on mount', async () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it('should default to "item" type', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const itemRadio = screen.getByLabelText(/^item$/i) as HTMLInputElement;
    const categoryRadio = screen.getByLabelText(/category/i) as HTMLInputElement;

    expect(itemRadio.checked).toBe(true);
    expect(categoryRadio.checked).toBe(false);
  });

  it('should toggle between item and category types', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const itemRadio = screen.getByLabelText(/^item$/i) as HTMLInputElement;
    const categoryRadio = screen.getByLabelText(/category/i) as HTMLInputElement;

    // Initially item is selected
    expect(itemRadio.checked).toBe(true);

    // Click category radio
    fireEvent.click(categoryRadio);

    expect(categoryRadio.checked).toBe(true);
    expect(itemRadio.checked).toBe(false);

    // Click item radio again
    fireEvent.click(itemRadio);

    expect(itemRadio.checked).toBe(true);
    expect(categoryRadio.checked).toBe(false);
  });

  it('should call onSubmit with correct data when submitting', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Enter item name
    fireEvent.change(input, { target: { value: 'Cheese' } });

    // Submit form
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalledWith('Cheese', 'item');
  });

  it('should submit category type when category radio is selected', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);
    const categoryRadio = screen.getByLabelText(/category/i);

    // Select category type
    fireEvent.click(categoryRadio);

    // Enter name
    fireEvent.change(input, { target: { value: 'Dairy' } });

    // Submit form
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalledWith('Dairy', 'category');
  });

  it('should clear input after submission', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i) as HTMLInputElement;

    // Enter item name
    fireEvent.change(input, { target: { value: 'Cheese' } });
    expect(input.value).toBe('Cheese');

    // Submit form
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    // Input should be cleared
    expect(input.value).toBe('');
  });

  it('should refocus input after submission for rapid entry', async () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Enter and submit
    fireEvent.change(input, { target: { value: 'Cheese' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    // Input should still have focus
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it('should not submit if input is empty', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Submit with empty input
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should not submit if input contains only whitespace', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Enter only whitespace
    fireEvent.change(input, { target: { value: '   ' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should trim whitespace from input before submitting', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Enter name with leading/trailing whitespace
    fireEvent.change(input, { target: { value: '  Cheese  ' } });
    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalledWith('Cheese', 'item');
  });

  it('should call onClose when clicking close button', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText(/close form/i);
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when pressing Escape key', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should display hint text about keyboard shortcuts', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    expect(screen.getByText(/press enter to add/i)).toBeInTheDocument();
    expect(screen.getByText(/escape to close/i)).toBeInTheDocument();
  });

  it('should have green background indicating form is active', () => {
    const { container } = render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const form = container.querySelector('form');
    expect(form).toHaveClass('bg-green-50');
  });

  it('should render close button with X icon', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText(/close form/i);
    expect(closeButton).toBeInTheDocument();

    // Check that it's actually a button
    expect(closeButton.tagName).toBe('BUTTON');
  });

  it('should handle rapid submissions correctly', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);

    // First submission
    fireEvent.change(input, { target: { value: 'Item 1' } });
    const form1 = input.closest('form');
    if (form1) fireEvent.submit(form1);

    expect(mockOnSubmit).toHaveBeenCalledWith('Item 1', 'item');

    // Second submission
    fireEvent.change(input, { target: { value: 'Item 2' } });
    const form2 = input.closest('form');
    if (form2) fireEvent.submit(form2);

    expect(mockOnSubmit).toHaveBeenCalledWith('Item 2', 'item');
    expect(mockOnSubmit).toHaveBeenCalledTimes(2);
  });

  it('should preserve type selection across submissions', () => {
    render(<InlineItemForm onSubmit={mockOnSubmit} onClose={mockOnClose} />);

    const input = screen.getByPlaceholderText(/enter item or category name/i);
    const categoryRadio = screen.getByLabelText(/category/i) as HTMLInputElement;

    // Select category type
    fireEvent.click(categoryRadio);

    // First submission
    fireEvent.change(input, { target: { value: 'Category 1' } });
    const form1 = input.closest('form');
    if (form1) fireEvent.submit(form1);

    expect(mockOnSubmit).toHaveBeenCalledWith('Category 1', 'category');

    // Type should still be category for next entry
    expect(categoryRadio.checked).toBe(true);

    // Second submission
    fireEvent.change(input, { target: { value: 'Category 2' } });
    const form2 = input.closest('form');
    if (form2) fireEvent.submit(form2);

    expect(mockOnSubmit).toHaveBeenCalledWith('Category 2', 'category');
  });
});
