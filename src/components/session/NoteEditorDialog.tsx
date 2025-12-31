import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface NoteEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  note: string;
  templateNote?: string; // Read-only template note shown for reference in session context
  onSave: (note: string) => void;
  noteType: 'template' | 'session';
}

export function NoteEditorDialog({
  open,
  onOpenChange,
  itemName,
  note,
  templateNote,
  onSave,
  noteType,
}: NoteEditorDialogProps) {
  const [editedNote, setEditedNote] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset edited note when dialog opens with new note
  useEffect(() => {
    if (open) {
      setEditedNote(note);
      // Focus textarea after dialog animation
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [open, note]);

  const handleSave = () => {
    onSave(editedNote.trim());
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEditedNote(note);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Save on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    // Cancel on Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const title = noteType === 'template' ? 'Template Note' : 'Session Note';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-content-primary">{itemName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Show template note for reference when editing session notes */}
        {noteType === 'session' && templateNote && (
          <div className="rounded-md bg-surface-tertiary border border-divider-primary p-3">
            <p className="text-xs font-medium text-content-tertiary mb-1">Template note:</p>
            <p className="text-sm text-content-secondary italic whitespace-pre-wrap">
              {templateNote}
            </p>
          </div>
        )}

        <div className="py-2">
          <textarea
            ref={textareaRef}
            value={editedNote}
            onChange={(e) => setEditedNote(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            placeholder={
              noteType === 'template'
                ? 'Add a note (e.g., brand preference, location, tips...)'
                : 'Add a note for this session...'
            }
            className="w-full min-h-[120px] rounded-md border border-divider-tertiary bg-surface-primary text-content-primary px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-y"
          />
          <p className="text-xs text-content-tertiary mt-1">Press Cmd/Ctrl + Enter to save</p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
