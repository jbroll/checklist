/**
 * Tests for AddFolderDialog component
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddFolderDialog } from './AddFolderDialog';

describe('AddFolderDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onAdd: vi.fn(),
  };

  describe('rendering', () => {
    it('renders dialog when open', () => {
      render(<AddFolderDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create New Folder')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<AddFolderDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows folder-specific labels by default', () => {
      render(<AddFolderDialog {...defaultProps} />);

      expect(screen.getByText('Folder Name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create folder/i })).toBeInTheDocument();
    });

    it('shows template-specific labels when defaultIsTemplate is true', () => {
      render(<AddFolderDialog {...defaultProps} defaultIsTemplate={true} />);

      expect(screen.getByText('List Name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create list/i })).toBeInTheDocument();
    });

    it('uses custom title and description when provided', () => {
      render(
        <AddFolderDialog
          {...defaultProps}
          title="Custom Title"
          description="Custom description text"
        />,
      );

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom description text')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onAdd with name and isTemplate=false by default', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();

      render(<AddFolderDialog {...defaultProps} onAdd={onAdd} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'My New Folder');
      await user.click(screen.getByRole('button', { name: /create folder/i }));

      expect(onAdd).toHaveBeenCalledWith('My New Folder', false);
    });

    it('calls onAdd with name and isTemplate=true when defaultIsTemplate', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();

      render(<AddFolderDialog {...defaultProps} onAdd={onAdd} defaultIsTemplate={true} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'Weekly Shopping');
      await user.click(screen.getByRole('button', { name: /create list/i }));

      expect(onAdd).toHaveBeenCalledWith('Weekly Shopping', true);
    });

    it('calls onOpenChange when dialog is closed', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(<AddFolderDialog {...defaultProps} onOpenChange={onOpenChange} />);

      // Click cancel button
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
