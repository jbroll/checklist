/**
 * Unit tests for useNoteEditor hook
 *
 * Tests inline note editing state (one open editor at a time) and save operations.
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

  const mockTemplate = { id: 'template-1' } as any;

  const mockG = {} as any;

  function renderNoteEditor({
    items = [createMockItem('item-1', 'Test Item')],
    session = { itemStates: {} } as any,
  }: {
    items?: ReturnType<typeof createMockItem>[];
    session?: any;
  } = {}) {
    return renderHook(() =>
      useNoteEditor({
        template: mockTemplate,
        session,
        sessionId: 'session-1',
        g: mockG,
        activeItems: items as any,
      }),
    );
  }

  beforeEach(() => {
    mockUpdateSessionItemNotes.mockReset();
    mockUpdateItemNotes.mockReset();
  });

  describe('initial state', () => {
    it('starts with no note open', () => {
      const { result } = renderNoteEditor();

      expect(result.current.noteEditing).toBeNull();
      expect(result.current.editingNoteItemId('available')).toBeNull();
      expect(result.current.editingNoteItemId('selected')).toBeNull();
    });
  });

  describe('toggleNoteEditor', () => {
    it('opens the editor on an item in the available zone', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('available')('item-1');
      });

      expect(result.current.noteEditing).toEqual({ itemId: 'item-1', zone: 'available' });
      expect(result.current.editingNoteItemId('available')).toBe('item-1');
    });

    it('reports a session-note editor to both session zones but not the available zone', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });

      expect(result.current.editingNoteItemId('selected')).toBe('item-1');
      expect(result.current.editingNoteItemId('checked')).toBe('item-1');
      expect(result.current.editingNoteItemId('available')).toBeNull();
    });

    it('closes the editor when toggled again on the same item', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });
      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });

      expect(result.current.noteEditing).toBeNull();
    });

    it('keeps only one editor open at a time', () => {
      const { result } = renderNoteEditor({
        items: [createMockItem('item-1', 'One'), createMockItem('item-2', 'Two')],
      });

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });
      act(() => {
        result.current.toggleNoteEditor('selected')('item-2');
      });

      expect(result.current.noteEditing).toEqual({ itemId: 'item-2', zone: 'selected' });
    });
  });

  describe('closeNoteEditor', () => {
    it('closes without saving', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('available')('item-1');
      });
      act(() => {
        result.current.closeNoteEditor();
      });

      expect(result.current.noteEditing).toBeNull();
      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
    });
  });

  describe('saveNote', () => {
    it('saves the template note for the available zone and closes', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('available')('item-1');
      });
      act(() => {
        result.current.saveNote('new note content');
      });

      expect(mockUpdateItemNotes).toHaveBeenCalledWith(
        mockG,
        'template-1',
        'item-1',
        'new note content',
      );
      expect(mockUpdateSessionItemNotes).not.toHaveBeenCalled();
      expect(result.current.noteEditing).toBeNull();
    });

    it('saves the session note for the selected zone', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });
      act(() => {
        result.current.saveNote('session note');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockG,
        'template-1',
        'session-1',
        'item-1',
        'session note',
      );
      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
    });

    it('saves the session note for the checked zone', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('checked')('item-1');
      });
      act(() => {
        result.current.saveNote('checked zone note');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockG,
        'template-1',
        'session-1',
        'item-1',
        'checked zone note',
      );
    });

    it('trims the note before saving', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.toggleNoteEditor('available')('item-1');
      });
      act(() => {
        result.current.saveNote('  padded \n');
      });

      expect(mockUpdateItemNotes).toHaveBeenCalledWith(mockG, 'template-1', 'item-1', 'padded');
    });

    it('clears the note when the trimmed result is empty', () => {
      const { result } = renderNoteEditor({
        session: { itemStates: { 'item-1': { notes: 'old note' } } },
      });

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });
      act(() => {
        result.current.saveNote('   ');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockG,
        'template-1',
        'session-1',
        'item-1',
        '',
      );
    });

    it('skips the write when the note is unchanged', () => {
      const { result } = renderNoteEditor({
        items: [createMockItem('item-1', 'Test Item', 'same note')],
      });

      act(() => {
        result.current.toggleNoteEditor('available')('item-1');
      });
      act(() => {
        result.current.saveNote('same note ');
      });

      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
      expect(result.current.noteEditing).toBeNull();
    });

    it('compares a session note against the session note, not the template note', () => {
      const { result } = renderNoteEditor({
        items: [createMockItem('item-1', 'Test Item', 'template note')],
        session: { itemStates: { 'item-1': { notes: 'session note' } } },
      });

      act(() => {
        result.current.toggleNoteEditor('selected')('item-1');
      });
      act(() => {
        result.current.saveNote('template note');
      });

      expect(mockUpdateSessionItemNotes).toHaveBeenCalledWith(
        mockG,
        'template-1',
        'session-1',
        'item-1',
        'template note',
      );
    });

    it('does nothing when no item is being edited', () => {
      const { result } = renderNoteEditor();

      act(() => {
        result.current.saveNote('note');
      });

      expect(mockUpdateItemNotes).not.toHaveBeenCalled();
      expect(mockUpdateSessionItemNotes).not.toHaveBeenCalled();
    });
  });
});
