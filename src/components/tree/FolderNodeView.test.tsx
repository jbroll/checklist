/**
 * Tests for FolderNodeView component
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Mock lazy-loaded dialogs
vi.mock('@/components/export/ExportDialog', () => ({
  ExportDialog: () => null,
}));
vi.mock('@/components/import/ImportDialog', () => ({
  ImportDialog: () => null,
}));
vi.mock('@/components/sharing/ShareDialog', () => ({
  ShareDialog: () => null,
}));

// Mock dialog context
vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock folder service
vi.mock('@/services/folderService', () => ({
  isTemplateFolder: vi.fn(),
  isOrganizationalFolder: vi.fn(),
  duplicateTemplate: vi.fn(),
}));

// Mock view state service
vi.mock('@/services/viewStateService', () => ({
  getFolderExpanded: vi.fn().mockReturnValue(false),
}));

// Mock user settings service
vi.mock('@/services/userSettingsService', () => ({
  getTemplateAutocompleteDomain: vi.fn().mockReturnValue('none'),
  setTemplateAutocompleteDomain: vi.fn(),
  getTemplateAutoCategorizeEnabled: vi.fn().mockReturnValue(false),
  toggleTemplateAutoCategorize: vi.fn(),
}));

// Mock categorization
vi.mock('@/lib/categorization', () => ({
  getDomainDisplayName: vi.fn((id) => id),
  getImplementedDomains: vi.fn().mockReturnValue(['grocery']),
}));

import * as folderService from '@/services/folderService';

// Helper to create mock folder
const createMockFolder = (
  name: string,
  isTemplate: boolean,
  options: { archived?: boolean } = {},
) => ({
  name,
  expanded: false,
  archived: options.archived ?? false,
  items: isTemplate ? [] : undefined,
  sessions: isTemplate ? [] : undefined,
  showZoneHeadings: false,
  children: !isTemplate ? [] : undefined,
  $jazz: {
    id: `folder-${Math.random().toString(36).slice(2)}`,
    set: vi.fn(),
  },
});

// Helper to create mock account
const createMockAccount = () => ({
  $jazz: { id: 'test-account' },
  root: {
    folders: [],
    viewState: {
      folderExpanded: {},
    },
  },
});

describe('FolderNodeView', () => {
  const mockAccount = createMockAccount();

  beforeEach(() => {
    vi.mocked(folderService.isTemplateFolder).mockReturnValue(false);
    vi.mocked(folderService.isOrganizationalFolder).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    folder: createMockFolder('Test Folder', false) as any,
    level: 0,
    onToggleExpand: vi.fn(),
    account: mockAccount as any,
  };

  describe('rendering', () => {
    it('renders folder name', () => {
      render(<FolderNodeView {...defaultProps} />);

      expect(screen.getByText('Test Folder')).toBeInTheDocument();
    });

    it('renders folder icon for organizational folders', () => {
      vi.mocked(folderService.isTemplateFolder).mockReturnValue(false);
      vi.mocked(folderService.isOrganizationalFolder).mockReturnValue(true);

      render(<FolderNodeView {...defaultProps} />);

      // Folder icon should be present (via lucide-react Folder)
      const button = screen.getByRole('button', { name: /test folder/i });
      expect(button).toBeInTheDocument();
    });

    it('renders template folder with list icon', () => {
      vi.mocked(folderService.isTemplateFolder).mockReturnValue(true);
      vi.mocked(folderService.isOrganizationalFolder).mockReturnValue(false);

      const templateFolder = createMockFolder('My List', true);
      render(<FolderNodeView {...defaultProps} folder={templateFolder as any} />);

      expect(screen.getByText('My List')).toBeInTheDocument();
    });

    it('shows archive icon when folder is archived', () => {
      const archivedFolder = createMockFolder('Archived Folder', false, { archived: true });
      render(<FolderNodeView {...defaultProps} folder={archivedFolder as any} />);

      expect(screen.getByText('Archived Folder')).toBeInTheDocument();
    });

    it('shows item count badge for template folders with items', () => {
      vi.mocked(folderService.isTemplateFolder).mockReturnValue(true);

      const templateFolder = createMockFolder('Shopping List', true);
      (templateFolder as any).items = [
        { id: '1', name: 'Milk', archived: false },
        { id: '2', name: 'Bread', archived: false },
        { id: '3', name: 'Eggs', archived: true }, // Archived - should not count
      ];

      render(<FolderNodeView {...defaultProps} folder={templateFolder as any} />);

      expect(screen.getByText('2')).toBeInTheDocument();
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

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Rename')).toBeInTheDocument();
    });

    it('shows duplicate option for template folders', async () => {
      const user = userEvent.setup();
      vi.mocked(folderService.isTemplateFolder).mockReturnValue(true);

      const templateFolder = createMockFolder('My List', true);
      render(<FolderNodeView {...defaultProps} folder={templateFolder as any} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Duplicate')).toBeInTheDocument();
    });

    it('shows share option', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Share')).toBeInTheDocument();
    });

    it('shows archive option when not archived and hideArchiveAction is false', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} hideArchiveAction={false} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    it('shows restore option when archived', async () => {
      const user = userEvent.setup();
      const archivedFolder = createMockFolder('Archived', false, { archived: true });

      render(
        <FolderNodeView
          {...defaultProps}
          folder={archivedFolder as any}
          hideArchiveAction={false}
        />,
      );

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Restore')).toBeInTheDocument();
    });

    it('shows delete option', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('shows import/export options for template folders', async () => {
      const user = userEvent.setup();
      vi.mocked(folderService.isTemplateFolder).mockReturnValue(true);

      const templateFolder = createMockFolder('My List', true);
      render(<FolderNodeView {...defaultProps} folder={templateFolder as any} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      expect(screen.getByText('Import')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('enters edit mode when rename is clicked', async () => {
      const user = userEvent.setup();

      render(<FolderNodeView {...defaultProps} />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /more options/i });
      await user.click(menuButton);

      // Click rename
      await user.click(screen.getByText('Rename'));

      // Input should appear
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('Test Folder');
    });

    it('calls onRename when name is changed and saved', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();

      render(<FolderNodeView {...defaultProps} onRename={onRename} />);

      // Open dropdown menu and click rename
      await user.click(screen.getByRole('button', { name: /more options/i }));
      await user.click(screen.getByText('Rename'));

      // Edit name
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'New Name{Enter}');

      expect(onRename).toHaveBeenCalledWith('New Name');
    });

    it('cancels edit on Escape', async () => {
      const user = userEvent.setup();
      const onRename = vi.fn();

      render(<FolderNodeView {...defaultProps} onRename={onRename} />);

      // Open dropdown menu and click rename
      await user.click(screen.getByRole('button', { name: /more options/i }));
      await user.click(screen.getByText('Rename'));

      // Type something then cancel
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
