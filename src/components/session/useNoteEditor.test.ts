/**
 * Unit tests for useNoteEditor hook
 *
 * Tests note editing state management and save operations.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNoteEditor } from './useNoteEditor';

// Mock the services
vi.mock('@/services/sessionService', () => ({
  updateSessionItemNotes: vi.fn(),
}));

vi.mock('@/services/templateService', () => ({
  updateItemNotes: vi.fn(),
}));

import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';

const mockUpdateSessionItemNotes = SessionService.updateSessionItemNotes as ReturnType<
  typeof vi.fn
>;
const mockUpdateItemNotes = templateService.updateItemNotes as ReturnType<typeof vi.fn>;

describe('useNoteEditor', () => {
  const createMockItem = (id: string, name: string, notes = '') => ({
    id,
    name,
    notes,
  });

  const mockTemplate = {
    $jazz: { id: 'template-1' },
  } as any;

  const mockMe = { id: 'user-1' } as any;

  beforeEach(() => {
    mockUpdateSessionItemNotes.mockReset();
    mockUpdateItemNotes.mockReset();
  });

  describe('initial state', () => {
    it('starts with editor closed', () => {
      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: [],
        }),
      );

      expect(result.current.noteEditorOpen).toBe(false);
    });

    it('has empty initial editing values', () => {
      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: [],
        }),
      );

      expect(result.current.noteEditingItemName).toBe('');
      expect(result.current.noteEditingCurrentNote).toBe('');
      expect(result.current.noteEditingTemplateNote).toBeUndefined();
    });
  });

  describe('openNoteEditor', () => {
    it('opens editor for available zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'existing note')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      expect(result.current.noteEditorOpen).toBe(true);
      expect(result.current.noteEditingItemName).toBe('Test Item');
      expect(result.current.noteEditingCurrentNote).toBe('existing note');
      expect(result.current.noteEditingType).toBe('template');
    });

    it('opens editor for selected zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'template note')];
      const session = {
        itemStates: {
          'item-1': { notes: 'session note' },
        },
      };

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: session as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('selected')('item-1');
      });

      expect(result.current.noteEditorOpen).toBe(true);
      expect(result.current.noteEditingCurrentNote).toBe('session note');
      expect(result.current.noteEditingTemplateNote).toBe('template note');
      expect(result.current.noteEditingType).toBe('session');
    });

    it('opens editor for checked zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'template note')];
      const session = {
        itemStates: {
          'item-1': { notes: 'checked note' },
        },
      };

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: session as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('checked')('item-1');
      });

      expect(result.current.noteEditingCurrentNote).toBe('checked note');
      expect(result.current.noteEditingType).toBe('session');
    });

    it('handles item with no notes', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      expect(result.current.noteEditingCurrentNote).toBe('');
    });

    it('handles missing session item state', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('selected')('item-1');
      });

      expect(result.current.noteEditingCurrentNote).toBe('');
    });

    it('handles unknown item ID', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('unknown-item');
      });

      expect(result.current.noteEditorOpen).toBe(true);
      expect(result.current.noteEditingItemName).toBe('');
    });
  });

  describe('setNoteEditorOpen', () => {
    it('can close the editor', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      expect(result.current.noteEditorOpen).toBe(true);

      act(() => {
        result.current.setNoteEditorOpen(false);
      });

      expect(result.current.noteEditorOpen).toBe(false);
    });
  });

  describe('handleSaveNote', () => {
    it('saves template note for available zone', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      act(() => {
        result.current.handleSaveNote('new note content');
      });

      expect(mockUpdateItemNotes).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'item-1',
        'new note content',
      );
      expect(mockUpdateSessionItemNotes).not.toHaveBeenCalled();
    });

    it('saves session note for selected zone', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('selected')('item-1');
      });

      act(() => {
        result.current.handleSaveNote('session note');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'item-1',
        'session note',
      );
      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
    });

    it('saves session note for checked zone', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('checked')('item-1');
      });

      act(() => {
        result.current.handleSaveNote('checked zone note');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockMe,
        'template-1',
        'session-1',
        'item-1',
        'checked zone note',
      );
    });

    it('does nothing when me is null', () => {
      const items = [createMockItem('item-1', 'Test Item')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: null,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      act(() => {
        result.current.handleSaveNote('note');
      });

      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
      expect(mockUpdateSessionItemNotes).not.toHaveBeenCalled();
    });

    it('does nothing when no item is being edited', () => {
      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: null,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: [],
        }),
      );

      act(() => {
        result.current.handleSaveNote('note');
      });

      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
      expect(mockUpdateSessionItemNotes).not.toHaveBeenCalled();
    });
  });

  describe('noteEditingTemplateNote', () => {
    it('is undefined for available zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'template note')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('available')('item-1');
      });

      expect(result.current.noteEditingTemplateNote).toBeUndefined();
    });

    it('is set for selected zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'template note')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('selected')('item-1');
      });

      expect(result.current.noteEditingTemplateNote).toBe('template note');
    });

    it('is set for checked zone', () => {
      const items = [createMockItem('item-1', 'Test Item', 'template note')];

      const { result } = renderHook(() =>
        useNoteEditor({
          template: mockTemplate,
          session: { itemStates: {} } as any,
          sessionId: 'session-1',
          me: mockMe,
          activeItems: items as any,
        }),
      );

      act(() => {
        result.current.openNoteEditor('checked')('item-1');
      });

      expect(result.current.noteEditingTemplateNote).toBe('template note');
    });
  });
});
