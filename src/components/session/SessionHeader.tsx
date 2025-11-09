import type { InstanceOfSchema } from 'jazz-tools';
import { Archive, Download, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { SessionExportDialog } from '@/components/export/SessionExportDialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatSessionDate } from '@/lib/utils';
import type { Account, FolderNode, ListSession } from '@/schemas';

interface SessionHeaderProps {
  folder: InstanceOfSchema<typeof FolderNode>;
  session: InstanceOfSchema<typeof ListSession>;
  sessionId: string;
  me: InstanceOfSchema<typeof Account>;
  showTime: boolean;
  viewModeIcon: React.ComponentType<{ className?: string }>;
  viewModeLabel: string;
  onCycleViewMode: () => void;
  onFinishSession: () => void;
  onToggleArchived: () => void;
}

export function SessionHeader({
  folder,
  session,
  sessionId,
  me,
  showTime,
  viewModeIcon: ViewModeIcon,
  viewModeLabel,
  onCycleViewMode,
  onFinishSession,
  onToggleArchived,
}: SessionHeaderProps) {
  const [showExportDialog, setShowExportDialog] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">
          {folder.name}{' '}
          <span className="text-neutral-500">
            · {formatSessionDate(session.startedAt, showTime)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCycleViewMode}
            className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
            title={`Cycle view - ${viewModeLabel}`}
            aria-label={`Cycle view - ${viewModeLabel}`}
          >
            <ViewModeIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onFinishSession}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Done
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                aria-label="More options"
              >
                <MoreVertical className="h-4 w-4 text-neutral-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={session?.archived || false}
                onCheckedChange={onToggleArchived}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archived
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Export Dialog */}
      <SessionExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        folder={folder}
        sessionId={sessionId}
        sessionName={session.name}
        account={me}
      />
    </>
  );
}
