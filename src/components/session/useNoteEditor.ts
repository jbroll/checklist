import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { useState } from 'react';
import type { FolderRow, SessionData, schema, TemplateItem } from '@/schema/folder';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';

type Graph = RelationalGraph<typeof schema>;

export type NoteZone = 'available' | 'selected' | 'checked';

interface UseNoteEditorOptions {
  template: FolderRow;
  session: SessionData | null;
  sessionId: string;
  g: Graph;
  activeItems: TemplateItem[];
}

const isTemplateZone = (zone: NoteZone) => zone === 'available';

/**
 * Tracks the one open inline note editor and saves its note: the template note in the
 * available zone, the session note in the selected/checked zones.
 */
export function useNoteEditor({
  template,
  session,
  sessionId,
  g,
  activeItems,
}: UseNoteEditorOptions) {
  const [noteEditing, setNoteEditing] = useState<{ itemId: string; zone: NoteZone } | null>(null);

  const toggleNoteEditor = (zone: NoteZone) => (itemId: string) => {
    setNoteEditing((current) =>
      current?.itemId === itemId && isTemplateZone(current.zone) === isTemplateZone(zone)
        ? null
        : { itemId, zone },
    );
  };

  const closeNoteEditor = () => setNoteEditing(null);

  const editingNoteItemId = (zone: NoteZone): string | null =>
    noteEditing && isTemplateZone(noteEditing.zone) === isTemplateZone(zone)
      ? noteEditing.itemId
      : null;

  const saveNote = (note: string) => {
    if (!noteEditing) return;
    const { itemId, zone } = noteEditing;
    const trimmed = note.trim();
    const currentNote = isTemplateZone(zone)
      ? activeItems.find((i) => i.id === itemId)?.notes || ''
      : session?.itemStates?.[itemId]?.notes || '';

    if (trimmed !== currentNote) {
      if (isTemplateZone(zone)) {
        templateService.updateItemNotes(g, template.id, itemId, trimmed);
      } else {
        SessionService.updateSessionItemNotes(g, template.id, sessionId, itemId, trimmed);
      }
    }
    setNoteEditing(null);
  };

  return {
    noteEditing,
    editingNoteItemId,
    toggleNoteEditor,
    closeNoteEditor,
    saveNote,
  };
}
