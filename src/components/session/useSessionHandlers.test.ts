/**
 * Unit tests for useSessionHandlers hook
 *
 * Tests session action handlers including item toggling, batch operations, and add item logic.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionHandlers } from './useSessionHandlers';

// Mock all the services
vi.mock('@/services/sessionService', () => ({
  toggleItemSelected: vi.fn(),
  toggleItemChecked: vi.fn(),
  batchSelectItems: vi.fn(),
  invertItemSelection: vi.fn(),
  createSession: vi.fn(() => 'new-session-id'),
  updateSessionItemNotes: vi.fn(),
}));

vi.mock('@/services/templateService', () => ({
  renameItem: vi.fn(),
  archiveItem: vi.fn(),
  toggleItemDefault: vi.fn(),
  batchSetItemsDefault: vi.fn(),
  invertItemsDefault: vi.fn(),
  createCategory: vi.fn(() => 'new-category-id'),
  createItem: vi.fn(() => 'new-item-id'),
  calculateInsertionPoint: vi.fn(() => ({ parentPath: undefined, sortOrder: 100 })),
}));

vi.mock('@/services/viewStateService', () => ({
  toggleTemplateCategoryExpanded: vi.fn(),
}));

vi.mock('@/services/userSettingsService', () => ({
  getTemplateAutoCategorizeEnabled: vi.fn(() => false),
}));

import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';

const mockToggleItemSelected = SessionService.toggleItemSelected as ReturnType<typeof vi.fn>;
const mockToggleItemChecked = SessionService.toggleItemChecked as ReturnType<typeof vi.fn>;
const mockBatchSelectItems = SessionService.batchSelectItems as ReturnType<typeof vi.fn>;
const mockInvertItemSelection = SessionService.invertItemSelection as ReturnType<typeof vi.fn>;
const mockCreateSession = SessionService.createSession as ReturnType<typeof vi.fn>;
const mockRenameItem = templateService.renameItem as ReturnType<typeof vi.fn>;
const mockArchiveItem = templateService.archiveItem as ReturnType<typeof vi.fn>;
const mockToggleItemDefault = templateService.toggleItemDefault as ReturnType<typeof vi.fn>;
const mockBatchSetItemsDefault = templateService.batchSetItemsDefault as ReturnType<typeof vi.fn>;
const mockInvertItemsDefault = templateService.invertItemsDefault as ReturnType<typeof vi.fn>;
const mockCreateCategory = templateService.createCategory as ReturnType<typeof vi.fn>;
const mockCreateItem = templateService.createItem as ReturnType<typeof vi.fn>;
const mockToggleCategoryExpanded = viewStateService.toggleTemplateCategoryExpanded as ReturnType<
  typeof vi.fn
>;
const mockGetAutoCategorize = userSettingsService.getTemplateAutoCategorizeEnabled as ReturnType<
  typeof vi.fn
>;

describe('useSessionHandlers', () => {
  const mockTemplate = {
    $jazz: { id: 'template-1' },
    items: [],
  } as any;

  const mockMe = { id: 'user-1' } as any;

  const mockCaptureScrollPosition = vi.fn();
  const mockSetSelectedItemId = vi.fn();
  const mockOnSwitchSession = vi.fn();

  const defaultOptions = {
    template: mockTemplate,
    session: { itemStates: {} } as any,
    sessionId: 'session-1',
    me: mockMe,
    activeItems: [],
    checkedItems: [],
    captureScrollPosition: mockCaptureScrollPosition,
    setSelectedItemId: mockSetSelectedItemId,
    onSwitchSession: mockOnSwitchSession,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAutoCategorize.mockReturnValue(false);
  });

  describe('handleRenameItem', () => {
    it('calls templateService.renameItem', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleRenameItem('item-1', 'New Name');
      });

      expect(mockRenameItem).toHaveBeenCalledWith(mockMe, 'template-1', 'item-1', 'New Name');
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, me: null }));

      act(() => {
        result.current.handleRenameItem('item-1', 'New Name');
      });

      expect(mockRenameItem).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteItem', () => {
    it('calls templateService.archiveItem', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleDeleteItem('item-1');
      });

      expect(mockArchiveItem).toHaveBeenCalledWith(mockMe, 'template-1', 'item-1');
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, me: null }));

      act(() => {
        result.current.handleDeleteItem('item-1');
      });

      expect(mockArchiveItem).not.toHaveBeenCalled();
    });
  });

  describe('handleToggleExpand', () => {
    it('toggles category expanded state', () => {
      const items = [{ id: 'cat-1', type: 'category' }];
      const template = { ...mockTemplate, items };

      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, template }));

      act(() => {
        result.current.handleToggleExpand('cat-1');
      });

      expect(mockToggleCategoryExpanded).toHaveBeenCalledWith(mockMe, 'template-1', 'cat-1');
    });

    it('does nothing for non-category items', () => {
      const items = [{ id: 'item-1', type: 'item' }];
      const template = { ...mockTemplate, items };

      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, template }));

      act(() => {
        result.current.handleToggleExpand('item-1');
      });

      expect(mockToggleCategoryExpanded).not.toHaveBeenCalled();
    });

    it('does nothing for unknown item', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleToggleExpand('unknown');
      });

      expect(mockToggleCategoryExpanded).not.toHaveBeenCalled();
    });
  });

  describe('handleToggleSelected', () => {
    it('captures scroll and toggles item selected', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleToggleSelected('item-1');
      });

      expect(mockCaptureScrollPosition).toHaveBeenCalled();
      expect(mockToggleItemSelected).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'item-1',
      );
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, me: null }));

      act(() => {
        result.current.handleToggleSelected('item-1');
      });

      expect(mockToggleItemSelected).not.toHaveBeenCalled();
    });
  });

  describe('handleToggleChecked', () => {
    it('captures scroll and toggles item checked', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleToggleChecked('item-1');
      });

      expect(mockCaptureScrollPosition).toHaveBeenCalled();
      expect(mockToggleItemChecked).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'item-1',
      );
    });
  });

  describe('handleBatchSelectAll', () => {
    it('batch selects items', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchSelectAll(['item-1', 'item-2']);
      });

      expect(mockCaptureScrollPosition).toHaveBeenCalled();
      expect(mockBatchSelectItems).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        ['item-1', 'item-2'],
        true,
      );
    });
  });

  describe('handleBatchDeselectAll', () => {
    it('batch deselects items', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchDeselectAll(['item-1', 'item-2']);
      });

      expect(mockBatchSelectItems).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        ['item-1', 'item-2'],
        false,
      );
    });
  });

  describe('handleBatchToggle', () => {
    it('inverts item selection', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchToggle(['item-1', 'item-2']);
      });

      expect(mockInvertItemSelection).toHaveBeenCalledWith(mockMe, 'template-1', 'session-1', [
        'item-1',
        'item-2',
      ]);
    });
  });

  describe('handleToggleDefault', () => {
    it('toggles default and session state', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleToggleDefault('item-1');
      });

      expect(mockCaptureScrollPosition).toHaveBeenCalled();
      expect(mockToggleItemDefault).toHaveBeenCalledWith(mockMe, 'template-1', 'item-1');
      expect(mockToggleItemSelected).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'item-1',
      );
    });
  });

  describe('handleBatchDefaultSelectAll', () => {
    it('sets defaults and session state', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchDefaultSelectAll(['item-1', 'item-2']);
      });

      expect(mockBatchSetItemsDefault).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        ['item-1', 'item-2'],
        true,
      );
      expect(mockBatchSelectItems).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        ['item-1', 'item-2'],
        true,
      );
    });
  });

  describe('handleBatchDefaultDeselectAll', () => {
    it('clears defaults and session state', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchDefaultDeselectAll(['item-1', 'item-2']);
      });

      expect(mockBatchSetItemsDefault).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        ['item-1', 'item-2'],
        false,
      );
      expect(mockBatchSelectItems).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        ['item-1', 'item-2'],
        false,
      );
    });
  });

  describe('handleBatchDefaultToggle', () => {
    it('inverts defaults and session state', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleBatchDefaultToggle(['item-1', 'item-2']);
      });

      expect(mockInvertItemsDefault).toHaveBeenCalledWith(mockMe, 'template-1', [
        'item-1',
        'item-2',
      ]);
      expect(mockInvertItemSelection).toHaveBeenCalledWith(mockMe, 'template-1', 'session-1', [
        'item-1',
        'item-2',
      ]);
    });
  });

  describe('handleClearOrNew', () => {
    it('does nothing when no checked items', () => {
      const { result } = renderHook(() =>
        useSessionHandlers({ ...defaultOptions, checkedItems: [] }),
      );

      act(() => {
        result.current.handleClearOrNew();
      });

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockOnSwitchSession).not.toHaveBeenCalled();
    });

    it('creates new session when items are checked', () => {
      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          checkedItems: [{ id: 'item-1' }] as any,
        }),
      );

      act(() => {
        result.current.handleClearOrNew();
      });

      expect(mockCreateSession).toHaveBeenCalledWith(mockMe, 'template-1');
      expect(mockOnSwitchSession).toHaveBeenCalledWith('new-session-id');
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          me: null,
          checkedItems: [{ id: 'item-1' }] as any,
        }),
      );

      act(() => {
        result.current.handleClearOrNew();
      });

      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it('does not call onSwitchSession when not provided', () => {
      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          checkedItems: [{ id: 'item-1' }] as any,
          onSwitchSession: undefined,
        }),
      );

      act(() => {
        result.current.handleClearOrNew();
      });

      expect(mockCreateSession).toHaveBeenCalled();
    });
  });

  describe('handleAddItem', () => {
    it('creates item without auto-categorization', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleAddItem({ type: 'item', name: 'New Item' });
      });

      expect(mockCreateItem).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'New Item',
        undefined,
        '',
        100,
      );
      expect(mockSetSelectedItemId).toHaveBeenCalledWith('new-item-id');
    });

    it('creates category', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleAddItem({ type: 'category', name: 'New Category' });
      });

      expect(mockCreateCategory).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'New Category',
        undefined,
        100,
      );
      expect(mockSetSelectedItemId).toHaveBeenCalledWith('new-category-id');
    });

    it('creates item with default quantity', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleAddItem({
          type: 'item',
          name: 'Milk',
          defaultQuantity: '1 gallon',
        });
      });

      expect(mockCreateItem).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'Milk',
        undefined,
        '1 gallon',
        100,
      );
    });

    it('does nothing when me is null', () => {
      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions, me: null }));

      act(() => {
        result.current.handleAddItem({ type: 'item', name: 'Test' });
      });

      expect(mockCreateItem).not.toHaveBeenCalled();
    });
  });

  describe('handleAddItemWithInsertionPoint', () => {
    it('creates item and syncs to session', () => {
      const { result } = renderHook(() => useSessionHandlers(defaultOptions));

      act(() => {
        result.current.handleAddItemWithInsertionPoint(
          { type: 'item', name: 'New Item' },
          'selected-item-id',
        );
      });

      expect(mockCreateItem).toHaveBeenCalled();
      expect(mockToggleItemSelected).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'new-item-id',
      );
    });
  });

  describe('auto-categorization', () => {
    it('uses existing category when auto-categorize enabled', () => {
      mockGetAutoCategorize.mockReturnValue(true);

      const activeItems = [{ id: 'cat-1', type: 'category', name: 'Dairy', path: 'Dairy' }];

      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          activeItems: activeItems as any,
        }),
      );

      act(() => {
        result.current.handleAddItem({
          type: 'item',
          name: 'Milk',
          categoryInfo: { categoryName: 'Dairy' },
        });
      });

      expect(mockCreateItem).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'Milk',
        'Dairy',
        '',
        undefined,
      );
    });

    it('creates new category when auto-categorize enabled and category not found', () => {
      mockGetAutoCategorize.mockReturnValue(true);

      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          activeItems: [],
        }),
      );

      act(() => {
        result.current.handleAddItem({
          type: 'item',
          name: 'Milk',
          categoryInfo: { categoryName: 'Dairy' },
        });
      });

      expect(mockCreateCategory).toHaveBeenCalledWith(mockMe, 'template-1', 'Dairy', undefined);
      expect(mockCreateItem).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'Milk',
        'Dairy',
        '',
        undefined,
      );
    });

    it('uses subcategory name when provided', () => {
      mockGetAutoCategorize.mockReturnValue(true);

      const activeItems = [
        { id: 'cat-1', type: 'category', name: 'Whole Milk', path: 'Whole Milk' },
      ];

      const { result } = renderHook(() =>
        useSessionHandlers({
          ...defaultOptions,
          activeItems: activeItems as any,
        }),
      );

      act(() => {
        result.current.handleAddItem({
          type: 'item',
          name: 'Organic Whole Milk',
          categoryInfo: { categoryName: 'Dairy', subcategoryName: 'Whole Milk' },
        });
      });

      expect(mockCreateItem).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'Organic Whole Milk',
        'Whole Milk',
        '',
        undefined,
      );
    });

    it('ignores category info when auto-categorize disabled', () => {
      mockGetAutoCategorize.mockReturnValue(false);

      const { result } = renderHook(() => useSessionHandlers({ ...defaultOptions }));

      act(() => {
        result.current.handleAddItem({
          type: 'item',
          name: 'Milk',
          categoryInfo: { categoryName: 'Dairy' },
        });
      });

      expect(mockCreateItem).toHaveBeenCalledWith(mockMe, 'template-1', 'Milk', undefined, '', 100);
    });
  });
});
