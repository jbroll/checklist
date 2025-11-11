import type { InstanceOfSchema } from 'jazz-tools';
import { Archive, Download, MoreVertical, ShoppingCart, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatSessionDate, hasMultipleSessionsOnSameDay } from '@/lib/utils';
import type { Session } from '@/schemas';
import { IndentedRow } from './IndentedRow';

interface SessionRowViewProps {
  session: InstanceOfSchema<typeof Session>;
  templateName: string;
  level: number;
  onOpen: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onExport?: (sessionId: string) => void;
  allSessions: readonly (InstanceOfSchema<typeof Session> | null)[];
}

export const SessionRowView = memo(function SessionRowView({
  session,
  templateName,
  level,
  onOpen,
  onDelete,
  onExport,
  allSessions,
}: SessionRowViewProps) {
  const [showMenu, setShowMenu] = useState(false);

  const showTime = hasMultipleSessionsOnSameDay(session, allSessions);

  const handleDelete = () => {
    const displayName = `${templateName} - ${formatSessionDate(session.createdAt, showTime)}`;
    if (onDelete && confirm(`Delete session "${displayName}"?`)) {
      onDelete(session.$jazz.id);
    }
  };

  return (
    <IndentedRow level={level} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
      <div className="group flex flex-1 items-center gap-2 rounded hover:bg-neutral-50">
        <button
          type="button"
          onClick={() => onOpen(session.$jazz.id)}
          className="flex flex-1 items-center gap-2"
        >
          {/* Session icon */}
          <ShoppingCart className="h-4 w-4" />

          {/* Relative date */}
          <span className="flex-1 text-left text-sm text-neutral-500">
            {formatSessionDate(session.createdAt, showTime)}
          </span>

          {/* Session stats */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-green-600">{session.checkedCount || 0}</span>
            <span className="text-neutral-900">/</span>
            <span className="text-neutral-900">
              {(session.checkedCount || 0) +
                (session.selectedCount || 0) +
                (session.remainingCount || 0)}
            </span>
          </div>
        </button>

        {/* Archived indicator */}
        {session.archived && <Archive className="h-4 w-4 shrink-0 text-neutral-400" />}

        {/* Actions menu */}
        <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="invisible rounded p-1 hover:bg-neutral-200 group-hover:visible"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4 text-neutral-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {onExport && (
              <DropdownMenuItem onClick={() => onExport(session.$jazz.id)}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </IndentedRow>
  );
});
