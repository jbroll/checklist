/**
 * Tests for FolderNodeView — slice 1 (folders-only). Renders against plain `FolderRow`
 * literals (the rowboat row shape), not a live graph — this component takes `folder` as a
 * prop and never touches `useRowboat`/`useSelect` itself.
 *
 * Drops item-count/duplicate/import/export/share/autocomplete assertions — those menu items
 * were removed from FolderNodeView along with the Jazz `FolderNode` items/sessions surface
 * (see the component's header comment); rename/archive/delete and drag-and-drop reparenting
 * are the only slice-1 concerns left to cover here.
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FolderRow } from '@/schema/folder';
import { FolderNodeView } from './FolderNodeView';

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
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

// Mock dialog context
vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeFolder(overrides: Partial<FolderRow> = {}): FolderRow {
  return {
    id: `folder-${Math.random().toString(36).slice(2)}`,
    owner_group_id: 'group-1',
    name: 'Test Folder',
    type: 'folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('FolderNodeView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    folder: makeFolder(),
    level: 0,
    onToggleExpand: vi.fn(),
  };

  describe('rendering', () => {
    it('renders folder name', () => {
      render(<FolderNodeView {...defaultProps} />);

      expect(screen.getByText('Test Folder')).toBeInTheDocument();
    });

    it('renders folder icon for organizational folders', () => {
      render(<FolderNodeView {...defaultProps} folder={makeFolder({ type: 'folder' })} />);

      const button = screen.getByRole('button', { name: /test folder/i });
      expect(button).toBeInTheDocument();
    });

    it('renders template folder with list icon', () => {
      const templateFolder = makeFolder({ name: 'My List', type: 'template-folder' });
      render(<FolderNodeView {...defaultProps} folder={templateFolder} />);

      expect(screen.getByText('My List')).toBeInTheDocument();
    });

    it('shows archive icon when folder is archived', () => {
      const archivedFolder = makeFolder({ name: 'Archived Folder', archived: true });
      render(<FolderNodeView {...defaultProps} folder={archivedFolder} />);

      expect(screen.getByText('Archived Folder')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onSelect when clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(<FolderNodeView {...defaultProps} onSelect={onSelect} />);

      await user.click(screen.getByText('Test Folder'));

      expect(onSelect).toHaveBeenCalled();
    });

    it('applies selected styling when isSelected is true', () => {
      render(<FolderNodeView {...defaultProps} isSelected={true} />);

      const button = screen.getByRole('button', { name: /test folder/i });
      expect(button).toHaveClass('bg-green-100');
    });
  });

  describe('expand/collapse', () => {
    it('calls onToggleExpand when expand control is clicked', async () => {
      const user = userEvent.setup();
      const onToggleExpand = vi.fn();

      render(
        <FolderNodeView {...defaultProps} onToggleExpand={onToggleExpand} hasChildren={true} />,
      );

      // Click on the expand/collapse chevron (aria-label is "Expand" when collapsed)
      const expandButton = screen.getByRole('button', { name: /expand/i });
      await user.click(expandButton);

      expect(onToggleExpand).toHaveBeenCalled();
    });
  });

  describe('context menu', () => {
    it('shows rename option in dropdown menu', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Rename')).toBeInTheDocument();
    });

    it('shows archive option when not archived and hideArchiveAction is false', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} hideArchiveAction={false} />);

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    it('shows restore option when archived', async () => {
      const user = userEvent.setup();
      const archivedFolder = makeFolder({ name: 'Archived', archived: true });

      render(
        <FolderNodeView {...defaultProps} folder={archivedFolder} hideArchiveAction={false} />,
      );

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Restore')).toBeInTheDocument();
    });

    it('hides archive/restore option when hideArchiveAction is true', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} hideArchiveAction={true} />);

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    });

    it('shows delete option', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('enters edit mode when rename is clicked', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);
      await user.click(screen.getByText('Rename'));

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('Test Folder');
    });

    it('calls onRename when name is changed and saved', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();

      render(<FolderNodeView {...defaultProps} onRename={onRename} />);

      await user.click(screen.getByRole('button', { name: /more options/i }));
      await user.click(screen.getByText('Rename'));

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'New Name{Enter}');

      expect(onRename).toHaveBeenCalledWith('New Name');
    });

    it('cancels edit on Escape', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();

      render(<FolderNodeView {...defaultProps} onRename={onRename} />);

      await user.click(screen.getByRole('button', { name: /more options/i }));
      await user.click(screen.getByText('Rename'));

      const input = screen.getByRole('textbox');
      await user.type(input, 'New Name{Escape}');

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('auto-starts editing when autoStartEditing is true', () => {
      const onAutoEditStarted = vi.fn();

      render(
        <FolderNodeView
          {...defaultProps}
          autoStartEditing={true}
          onAutoEditStarted={onAutoEditStarted}
        />,
      );

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(onAutoEditStarted).toHaveBeenCalled();
    });
  });

  describe('children', () => {
    it('renders children when provided', () => {
      render(
        <FolderNodeView {...defaultProps}>
          <div data-testid="child-content">Child Content</div>
        </FolderNodeView>,
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });
});
