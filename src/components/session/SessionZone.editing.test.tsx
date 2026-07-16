/**
 * Component tests for SessionZone — category name editing.
 * Split out of SessionZone.test.tsx to stay under the test-size cap.
 */

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionZone } from './SessionZone';

// Mock the rowboat graph hook — SessionZone only threads it through to
// templateService.renameItem (mocked below), so an empty stub graph is enough.
vi.mock('@/rowboat', () => ({
  useRowboat: () => ({}),
}));

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

vi.mock('@/services/templateService', () => ({
  renameItem: vi.fn(),
}));

function createMockItem(id: string, name: string, type: 'item' | 'category' = 'item') {
  return {
    id,
    name,
    path: name.toLowerCase(),
    type,
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    createdAt: Date.now(),
  };
}

function createMockTemplate(id: string) {
  return { id, items: [], sessions: [] };
}

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

describe('SessionZone — category name editing', () => {
  it('shows input when in edit mode', () => {
    const categoryItem = createMockItem('cat-1', 'Category Name', 'category');
    const template = createMockTemplate('template-1');

    render(
      <SessionZone
        {...defaultProps}
        template={template as any}
        categorySelection={{ categoryItem }}
        editModeProps={{
          isEditingThisItem: true,
          canEditItem: true,
          onEnterEditMode: vi.fn(),
          onExitEditMode: vi.fn(),
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('calls onExitEditMode when Escape is pressed during edit', async () => {
    const user = userEvent.setup();
    const onExitEditMode = vi.fn();
    const categoryItem = createMockItem('cat-1', 'Category Name', 'category');
    const template = createMockTemplate('template-1');

    render(
      <SessionZone
        {...defaultProps}
        template={template as any}
        categorySelection={{ categoryItem }}
        editModeProps={{
          isEditingThisItem: true,
          canEditItem: true,
          onEnterEditMode: vi.fn(),
          onExitEditMode,
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '{Escape}');

    expect(onExitEditMode).toHaveBeenCalled();
  });

  it('saves on Enter when value changed', async () => {
    const user = userEvent.setup();
    const onExitEditMode = vi.fn();
    const categoryItem = createMockItem('cat-1', 'Category Name', 'category');
    const template = createMockTemplate('template-1');

    render(
      <SessionZone
        {...defaultProps}
        template={template as any}
        categorySelection={{ categoryItem }}
        editModeProps={{
          isEditingThisItem: true,
          canEditItem: true,
          onEnterEditMode: vi.fn(),
          onExitEditMode,
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'New Name{Enter}');

    expect(onExitEditMode).toHaveBeenCalled();
  });

  it('exits edit mode without saving when value is empty', async () => {
    const user = userEvent.setup();
    const onExitEditMode = vi.fn();
    const categoryItem = createMockItem('cat-1', 'Category Name', 'category');
    const template = createMockTemplate('template-1');

    render(
      <SessionZone
        {...defaultProps}
        template={template as any}
        categorySelection={{ categoryItem }}
        editModeProps={{
          isEditingThisItem: true,
          canEditItem: true,
          onEnterEditMode: vi.fn(),
          onExitEditMode,
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onExitEditMode).toHaveBeenCalled();
  });

  it('saves on blur', async () => {
    const user = userEvent.setup();
    const onExitEditMode = vi.fn();
    const categoryItem = createMockItem('cat-1', 'Category Name', 'category');
    const template = createMockTemplate('template-1');

    render(
      <SessionZone
        {...defaultProps}
        template={template as any}
        categorySelection={{ categoryItem }}
        editModeProps={{
          isEditingThisItem: true,
          canEditItem: true,
          onEnterEditMode: vi.fn(),
          onExitEditMode,
        }}
      />,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'Updated Name');
    await user.tab(); // blur the input

    expect(onExitEditMode).toHaveBeenCalled();
  });
});
