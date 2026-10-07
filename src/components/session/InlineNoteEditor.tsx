import {
  forwardRef,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

/**
 * Note-icon click: closing an open editor goes through blur so the draft is saved. An editor
 * that has lost focus already saved on that blur, so it can simply be toggled closed.
 */
export function toggleInlineNote(
  isOpen: boolean,
  noteRef: RefObject<HTMLTextAreaElement | null>,
  toggle: () => void,
) {
  const textarea = noteRef.current;
  if (isOpen && textarea && textarea === document.activeElement) textarea.blur();
  else toggle();
}

interface InlineNoteEditorProps {
  note: string;
  templateNote?: string;
  noteType: 'template' | 'session';
  itemName: string;
  onSave: (note: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
}

export const InlineNoteEditor = forwardRef<HTMLTextAreaElement, InlineNoteEditorProps>(
  function InlineNoteEditor(
    { note, templateNote, noteType, itemName, onSave, onCancel, style },
    ref,
  ) {
    const [draft, setDraft] = useState(note);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Escape/Enter close the editor, and the textarea can still fire blur while unmounting.
    const finished = useRef(false);

    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

    useEffect(() => {
      textareaRef.current?.focus();
    }, []);

    const finish = (save: boolean) => {
      if (finished.current) return;
      finished.current = true;
      if (save) onSave(draft);
      else onCancel();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };

    return (
      <div className="pb-2 pr-1" style={style}>
        {noteType === 'session' && templateNote && (
          <div className="mb-1 rounded-md bg-surface-tertiary border border-divider-primary px-2 py-1">
            <p className="text-xs font-medium text-content-tertiary">Template note:</p>
            <p className="text-xs text-content-secondary italic whitespace-pre-wrap">
              {templateNote}
            </p>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => finish(true)}
          maxLength={2000}
          rows={2}
          aria-label={`${noteType === 'template' ? 'Template' : 'Session'} note for ${itemName}`}
          placeholder={
            noteType === 'template'
              ? 'Add a note (e.g., brand preference, location, tips...)'
              : 'Add a note for this session...'
          }
          className="w-full rounded-md border border-divider-tertiary bg-surface-primary text-content-primary px-2 py-1 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-y"
        />
      </div>
    );
  },
);
