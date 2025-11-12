import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Account, Session, Template } from '@/schemas';
import { SimplifiedSessionView } from './SimplifiedSessionView';
import * as simplifiedSessionService from '@/services/simplified/simplifiedSessionService';
import * as templateService from '@/services/templateService';

// Mock the services
vi.mock('@/services/simplified/simplifiedSessionService');
vi.mock('@/services/templateService');

// Mock Jazz CoValues
const createMockSession = (
  sessionId: string,
  itemStates: Record<string, { selected: boolean; checked: boolean }> = {},
): InstanceOfSchema<typeof Session> => {
  const session: any = {
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: new Date('2024-01-01'),
    lastActivityAt: new Date(),
  };

  session.$jazz = {
    id: sessionId,
    set: vi.fn((key: string, value: any) => {
      session[key] = value;
    }),
  };

  return session as InstanceOfSchema<typeof Session>;
};

const createMockTemplate = (
  templateId: string,
  items: any[],
  sessions: InstanceOfSchema<typeof Session>[],
): InstanceOfSchema<typeof Template> => {
  const template: any = {
    name: 'Test Template',
    items,
    sessions,
    currentSessionId: sessions[0]?.$jazz.id || '',
    owner: { id: 'owner-1' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  template.$jazz = {
    id: templateId,
    set: vi.fn((key: string, value: any) => {
      template[key] = value;
    }),
  };

  return template as InstanceOfSchema<typeof Template>;
};

const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  return {
    root: {
      templates: [],
      directory: [],
    },
  } as any;
};

describe('SimplifiedSessionView', () => {
  let mockAccount: InstanceOfSchema<typeof Account>;
  let mockTemplate: InstanceOfSchema<typeof Template>;
  let mockSession: InstanceOfSchema<typeof Session>;
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockAccount = createMockAccount();

    const items = [
      {
        id: 'item-1',
        name: 'Milk',
        type: 'item',
        path: 'milk',
        expanded: false,
        sortOrder: 1,
        archived: false,
        defaultQuantity: '1',
        createdAt: new Date(),
      },
      {
        id: 'item-2',
        name: 'Bread',
        type: 'item',
        path: 'bread',
        expanded: false,
        sortOrder: 2,
        archived: false,
        defaultQuantity: '1',
        createdAt: new Date(),
      },
      {
        id: 'item-3',
        name: 'Eggs',
        type: 'item',
        path: 'eggs',
        expanded: false,
        sortOrder: 3,
        archived: true,
        defaultQuantity: '1',
        createdAt: new Date(),
      },
    ];

    mockSession = createMockSession('session-1', {
      'item-1': { selected: false, checked: false },
      'item-2': { selected: false, checked: false },
    });

    mockTemplate = createMockTemplate('template-1', items, [mockSession]);

    // Mock getOrCreateCurrentSession to return our session ID
    vi.mocked(simplifiedSessionService.getOrCreateCurrentSession).mockReturnValue('session-1');
  });

  it('should render session header with template name', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    expect(screen.getByText('Test Template')).toBeInTheDocument();
  });

  it('should render header controls', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flat view/i })).toBeInTheDocument(); // Default is zone
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('should display items in zone view', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Should show Available zone
    expect(screen.getByText(/available/i)).toBeInTheDocument();

    // Should show non-archived items
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();

    // Should not show archived items
    expect(screen.queryByText('Eggs')).not.toBeInTheDocument();
  });

  it('should toggle between zone and flat views', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Initially in zone view
    expect(screen.getByText(/available/i)).toBeInTheDocument();

    // Click flat view button
    const flatViewButton = screen.getByRole('button', { name: /flat view/i });
    fireEvent.click(flatViewButton);

    // Zone heading should disappear
    expect(screen.queryByText(/available/i)).not.toBeInTheDocument();

    // Button text should change
    expect(screen.getByRole('button', { name: /zone view/i })).toBeInTheDocument();

    // Items should still be visible
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
  });

  it('should call onBack when clicking Done button', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    const doneButton = screen.getByRole('button', { name: /done/i });
    fireEvent.click(doneButton);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('should call clearSessionState when clicking Clear button', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(simplifiedSessionService.clearSessionState).toHaveBeenCalledWith(
      mockTemplate,
      'session-1',
    );
  });

  it('should show inline form when clicking Add Item', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Initially, inline form should not be visible
    expect(screen.queryByPlaceholderText(/enter item or category name/i)).not.toBeInTheDocument();

    // Click Add Item button
    const addButton = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addButton);

    // Inline form should appear
    expect(screen.getByPlaceholderText(/enter item or category name/i)).toBeInTheDocument();
  });

  it('should close inline form when clicking close in form', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Open form
    const addButton = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addButton);

    expect(screen.getByPlaceholderText(/enter item or category name/i)).toBeInTheDocument();

    // Close form
    const closeButton = screen.getByLabelText(/close form/i);
    fireEvent.click(closeButton);

    // Form should disappear
    expect(screen.queryByPlaceholderText(/enter item or category name/i)).not.toBeInTheDocument();
  });

  it('should add new item to template when submitting form', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Open form
    const addButton = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addButton);

    // Enter item name
    const input = screen.getByPlaceholderText(/enter item or category name/i);
    fireEvent.change(input, { target: { value: 'Cheese' } });

    // Submit form
    fireEvent.submit(input.closest('form')!);

    // Template should have new item added
    expect(mockTemplate.$jazz.set).toHaveBeenCalledWith(
      'items',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Cheese',
          type: 'item',
        }),
      ]),
    );
  });

  it('should update session when toggling item checkbox', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Find checkbox for Milk (first item)
    const checkboxes = screen.getAllByRole('checkbox');
    const milkCheckbox = checkboxes[0];

    // Click checkbox
    fireEvent.click(milkCheckbox);

    // Session should be updated with checked state
    expect(mockSession.$jazz.set).toHaveBeenCalledWith(
      'itemStates',
      expect.objectContaining({
        'item-1': expect.objectContaining({
          checked: true,
        }),
      }),
    );

    // Counts should be updated
    expect(mockSession.$jazz.set).toHaveBeenCalledWith('checkedCount', expect.any(Number));
    expect(mockSession.$jazz.set).toHaveBeenCalledWith('remainingCount', expect.any(Number));
    expect(mockSession.$jazz.set).toHaveBeenCalledWith('lastActivityAt', expect.any(Date));
  });

  it('should call archiveItem when deleting an item', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Open form to show trash icons
    const addButton = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addButton);

    // Find and click delete button (note: in actual UI this may require hover)
    const deleteButton = screen.getByLabelText(/delete milk/i);
    fireEvent.click(deleteButton);

    // Should call templateService.archiveItem
    expect(templateService.archiveItem).toHaveBeenCalledWith(
      mockAccount,
      'template-1',
      'item-1',
    );
  });

  it('should show empty state when no items exist', () => {
    // Create template with no items
    const emptySession = createMockSession('session-empty', {});
    const emptyTemplate = createMockTemplate('template-empty', [], [emptySession]);

    vi.mocked(simplifiedSessionService.getOrCreateCurrentSession).mockReturnValue('session-empty');

    render(
      <SimplifiedSessionView
        account={mockAccount}
        template={emptyTemplate}
        onBack={mockOnBack}
      />,
    );

    // Should show empty state message
    expect(screen.getByText(/no items in this list yet/i)).toBeInTheDocument();
    expect(screen.getByText(/click "add item" to get started/i)).toBeInTheDocument();
  });

  it('should show session creation date in header', () => {
    render(
      <SimplifiedSessionView account={mockAccount} template={mockTemplate} onBack={mockOnBack} />,
    );

    // Should display session date
    expect(screen.getByText(/session:/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/1\/2024/i)).toBeInTheDocument();
  });

  it('should render error state if session not found', () => {
    // Create template with no sessions
    const noSessionTemplate = createMockTemplate('template-no-session', [], []);

    vi.mocked(simplifiedSessionService.getOrCreateCurrentSession).mockReturnValue(
      'non-existent-session',
    );

    render(
      <SimplifiedSessionView
        account={mockAccount}
        template={noSessionTemplate}
        onBack={mockOnBack}
      />,
    );

    // Should show error message
    expect(screen.getByText(/failed to load session/i)).toBeInTheDocument();
  });
});
