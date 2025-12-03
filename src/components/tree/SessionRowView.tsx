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
import { formatSessionDate, hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { SessionData } from '@/schemas';
import { IndentedRow } from './IndentedRow';

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

  const showTime = hasMultipleSessionsOnSameDay(session, allSessions);

  const handleToggleArchived = async () => {
    const displayName = `${templateName} - ${formatSessionDate(session.createdAt, showTime)}`;
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
    const displayName = `${templateName} - ${formatSessionDate(session.createdAt, showTime)}`;
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
            {formatSessionDate(session.createdAt, showTime)}
          </span>

          {/* Session stats */}
          <div className="flex items-center gap-1 text-base">
            <span className="text-green-600">{session.checkedCount || 0}</span>
            <span className="text-content-primary">/</span>
            <span className="text-content-primary">
              {(session.checkedCount || 0) +
                (session.selectedCount || 0) +
                (session.remainingCount || 0)}
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
