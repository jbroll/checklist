import type { InstanceOfSchema } from 'jazz-tools';
import { MoreVertical, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShoppingSession } from '@/schemas/tree';
import { TreeNode } from './TreeNode';

interface SessionRowViewProps {
  session: InstanceOfSchema<typeof ShoppingSession>;
  level: number;
  onOpen: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}

export const SessionRowView = memo(function SessionRowView({
  session,
  level,
  onOpen,
  onDelete,
}: SessionRowViewProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleDelete = () => {
    if (onDelete && confirm(`Delete session "${session.name}"?`)) {
      onDelete(session.$jazz.id);
    }
  };

  const statusIcon =
    session.status === 'completed' ? '✅' : session.status === 'active' ? '🛒' : '⏸️';

  return (
    <TreeNode level={level} expanded={false} onToggleExpand={() => {}} hasChildren={false}>
      <div className="group flex flex-1 items-center gap-2 rounded hover:bg-neutral-50">
        <button
          type="button"
          onClick={() => onOpen(session.$jazz.id)}
          className="flex flex-1 items-center gap-2"
        >
          {/* Status icon */}
          <span className="text-base">{statusIcon}</span>

          {/* Session name */}
          <span className="flex-1 text-left text-sm text-neutral-900">{session.name}</span>

          {/* Session stats */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-green-600">{session.completedCount || 0}</span>
            <span className="text-neutral-900">/</span>
            <span className="text-neutral-900">
              {(session.completedCount || 0) +
                (session.inCartCount || 0) +
                (session.remainingCount || 0)}
            </span>
          </div>
        </button>

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
            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TreeNode>
  );
});
