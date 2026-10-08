import {
  Archive,
  ArchiveX,
  Download,
  MoreVertical,
  Pencil,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/lib/dialog-context';
import { formatDuration, formatSessionDate } from '@/lib/utils';
import type { SessionData, TemplateItem } from '@/schema/folder';
import { getSessionDuration, isSessionComplete } from '@/services/sessionStats';
import { IndentedRow } from './IndentedRow';

/**
 * Whether `session` shares its calendar day with another entry in `allSessions` — used to
 * decide whether the row needs to show a time alongside the date. Reimplemented locally
 * (rather than `hasMultipleSessionsOnSameDay` from `@/lib/utils`) because that helper's
 * `SessionData` is the Date-carrying shape (`createdAt: Date`); the rowboat `SessionData` here
 * carries `createdAt` as an epoch-ms number (see `shared/schema.ts`).
 */
function hasMultipleOnSameDay(
  session: SessionData,
  allSessions: readonly (SessionData | null)[],
): boolean {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const targetDay = startOfDay(session.createdAt);
  const count = allSessions.filter((s) => s && startOfDay(s.createdAt) === targetDay).length;
  return count > 1;
}

interface SessionRowViewProps {
  session: SessionData;
  templateName: string;
  items: readonly TemplateItem[];
  level: number;
  onOpen: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onArchive?: (sessionId: string) => void;
  onExport?: (sessionId: string) => void;
  onRename?: (sessionId: string, name: string) => void;
  allSessions: readonly (SessionData | null)[];
  hideArchiveAction?: boolean;
}

export const SessionRowView = memo(function SessionRowView({
  session,
  templateName,
  items,
  level,
  onOpen,
  onDelete,
  onArchive,
  onExport,
  onRename,
  allSessions,
  hideArchiveAction = false,
}: SessionRowViewProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const renameRequested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showConfirm } = useDialog();

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const showTime = hasMultipleOnSameDay(session, allSessions);
  const sessionDateLabel = formatSessionDate(new Date(session.createdAt), showTime);
  const label = session.name || sessionDateLabel;
  const displayName = `${templateName} - ${label}`;
  const duration = isSessionComplete(session) ? getSessionDuration(session, items) : null;
  const doneIn = duration === null ? null : formatDuration(duration);

  const handleStartEdit = () => {
    renameRequested.current = true;
    setEditedName(session.name ?? '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim() !== (session.name ?? '') && onRename) {
      onRename(session.id, editedName);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleToggleArchived = async () => {
    if (session.archived) {
      // Unarchive
      if (onArchive) {
        onArchive(session.id);
      }
    } else {
      // Archive
      if (onArchive) {
        const confirmed = await showConfirm({
          title: 'Archive Session',
          message: displayName,
          confirmText: 'Archive',
          variant: 'danger',
        });
        if (confirmed) {
          onArchive(session.id);
        }
      }
    }
  };

  const handleDelete = async () => {
    // If not archived, archive first (soft delete)
    if (!session.archived) {
      if (onArchive) {
        const confirmed = await showConfirm({
          title: 'Delete Session',
          message: displayName,
          confirmText: 'Delete',
          variant: 'danger',
        });
        if (confirmed) {
          onArchive(session.id);
        }
      }
    } else {
      // If already archived, permanent deletion
      if (onDelete) {
        const confirmed = await showConfirm({
          title: 'Permanent Delete',
          message: displayName,
          confirmText: 'Delete Permanently',
          variant: 'danger',
        });
        if (confirmed) {
          onDelete(session.id);
        }
      }
    }
  };

  return (
    <IndentedRow level={level} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
      <div className="group flex flex-1 items-center gap-2 rounded hover:bg-neutral-50">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <ShoppingCart className="h-4 w-4 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={editedName}
              placeholder={sessionDateLabel}
              aria-label="Session name"
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="flex-1 min-w-0 rounded border border-green-500 px-2 py-0.5 text-base bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(session.id)}
            className="flex flex-1 items-center gap-2"
          >
            {/* Session icon */}
            <ShoppingCart className="h-4 w-4" />

            <span className="flex-1 text-left text-base text-content-tertiary">{label}</span>

            {/* Session stats */}
            <div className="flex items-center gap-1 text-base">
              {doneIn && (
                <span className="mr-1 whitespace-nowrap text-xs text-content-tertiary">
                  {`Done in ${doneIn}`}
                </span>
              )}
              <span className="text-green-600">{session.checkedCount}</span>
              <span className="text-content-primary">/</span>
              <span className="text-content-primary">
                {session.checkedCount + session.selectedCount + session.remainingCount}
              </span>
            </div>
          </button>
        )}

        {/* Archived indicator */}
        {session.archived && <Archive className="h-4 w-4 shrink-0 text-content-disabled" />}

        {/* Actions menu */}
        {!isEditing && (
          <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 hover:bg-interactive-hover"
                aria-label="More options"
              >
                <MoreVertical className="h-4 w-4 text-content-secondary" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
              onCloseAutoFocus={(e) => {
                // Returning focus to the trigger would blur the rename input and save it at once.
                if (renameRequested.current) e.preventDefault();
                renameRequested.current = false;
              }}
            >
              {onRename && (
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
              )}
              {onExport && (
                <DropdownMenuItem onClick={() => onExport(session.id)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
              )}
              {(onRename || onExport) && !hideArchiveAction && <DropdownMenuSeparator />}
              {!hideArchiveAction && (
                <>
                  <DropdownMenuItem onClick={handleToggleArchived}>
                    {session.archived ? (
                      <>
                        <ArchiveX className="mr-2 h-4 w-4" />
                        Restore
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </IndentedRow>
  );
});
