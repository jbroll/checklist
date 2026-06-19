import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import type { Account, SessionData, Template, TemplateItem } from '@/schema';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';

type NoteZone = 'available' | 'selected' | 'checked';

interface UseNoteEditorOptions {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData | null;
  sessionId: string;
  me: InstanceOfSchema<typeof Account> | null;
  activeItems: TemplateItem[];
}

/**
 * Hook for managing note editing state and operations.
 * Handles both template-level notes (available zone) and session-level notes.
 */
export function useNoteEditor({
  template,
  session,
  sessionId,
  me,
  activeItems,
}: UseNoteEditorOptions) {
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteEditingItemId, setNoteEditingItemId] = useState<string | null>(null);
  const [noteEditingZone, setNoteEditingZone] = useState<NoteZone>('available');

  const openNoteEditor = (zone: NoteZone) => (itemId: string) => {
    setNoteEditingItemId(itemId);
    setNoteEditingZone(zone);
    setNoteEditorOpen(true);
  };

  const handleSaveNote = (note: string) => {
    if (!me || !noteEditingItemId) return;

    if (noteEditingZone === 'available') {
      templateService.updateItemNotes(me, template.$jazz.id, noteEditingItemId, note);
    } else {
      SessionService.updateSessionItemNotes(
        me,
        template.$jazz.id,
        sessionId,
        noteEditingItemId,
        note,
      );
    }
  };

  // Compute current note values for the editor
  const noteEditingItem = noteEditingItemId
    ? activeItems.find((i) => i.id === noteEditingItemId)
    : null;

  const noteEditingCurrentNote =
    noteEditingZone === 'available'
      ? noteEditingItem?.notes || ''
      : session?.itemStates?.[noteEditingItemId || '']?.notes || '';

  const noteEditingTemplateNote =
    noteEditingZone !== 'available' ? noteEditingItem?.notes : undefined;

  return {
    // State
    noteEditorOpen,
    setNoteEditorOpen,

    // Computed values for dialog
    noteEditingItemName: noteEditingItem?.name || '',
    noteEditingCurrentNote,
    noteEditingTemplateNote,
    noteEditingType: noteEditingZone === 'available' ? ('template' as const) : ('session' as const),

    // Handlers
    openNoteEditor,
    handleSaveNote,
  };
}
