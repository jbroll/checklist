import { Archive, ArchiveX, Download, MoreVertical, ShoppingCart, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDialog } from '@/lib/dialog-context';
import { formatSessionDate } from '@/lib/utils';
import type { SessionData } from '@/schema/folder';
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
  level: number;
  onOpen: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onArchive?: (sessionId: string) => void;
  onExport?: (sessionId: string) => void;
  allSessions: readonly (SessionData | null)[];
  hideArchiveAction?: boolean;
}

export const SessionRowView = memo(function SessionRowView({
  session,
  templateName,
  level,
  onOpen,
  onDelete,
  onArchive,
  onExport,
  allSessions,
  hideArchiveAction = false,
}: SessionRowViewProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { showConfirm } = useDialog();

  const showTime = hasMultipleOnSameDay(session, allSessions);
  const sessionDateLabel = formatSessionDate(new Date(session.createdAt), showTime);

  const handleToggleArchived = async () => {
    const displayName = `${templateName} - ${sessionDateLabel}`;
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
    const displayName = `${templateName} - ${sessionDateLabel}`;
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
        <button
          type="button"
          onClick={() => onOpen(session.id)}
          className="flex flex-1 items-center gap-2"
        >
          {/* Session icon */}
          <ShoppingCart className="h-4 w-4" />

          {/* Relative date */}
          <span className="flex-1 text-left text-base text-content-tertiary">
            {sessionDateLabel}
          </span>

          {/* Session stats */}
          <div className="flex items-center gap-1 text-base">
            <span className="text-green-600">{session.checkedCount}</span>
            <span className="text-content-primary">/</span>
            <span className="text-content-primary">
              {session.checkedCount + session.selectedCount + session.remainingCount}
            </span>
          </div>
        </button>

        {/* Archived indicator */}
        {session.archived && <Archive className="h-4 w-4 shrink-0 text-content-disabled" />}

        {/* Actions menu */}
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
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {onExport && (
              <DropdownMenuItem onClick={() => onExport(session.id)}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
            )}
            {onExport && !hideArchiveAction && <DropdownMenuSeparator />}
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
      </div>
    </IndentedRow>
  );
});
