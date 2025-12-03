import type { InstanceOfSchema } from 'jazz-tools';
import { Archive, Download, MoreVertical, Pencil, Plus } from 'lucide-react';
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
import type { Account, SessionData, Template } from '@/schemas';

interface SessionHeaderProps {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData;
  sessionId: string;
  me: InstanceOfSchema<typeof Account>;
  showTime: boolean;
  viewModeIcon: React.ComponentType<{ className?: string }>;
  viewModeLabel: string;
  onCycleViewMode: () => void;
  onFinishSession: () => void;
  onToggleArchived: () => void;
  showAddForm?: boolean;
  onClear?: () => void;
  onToggleAddForm?: () => void;
}

export function SessionHeader({
  template,
  session,
  sessionId,
  me,
  showTime,
  viewModeIcon: ViewModeIcon,
  viewModeLabel,
  onCycleViewMode,
  onFinishSession,
  onToggleArchived,
  showAddForm = false,
  onClear,
  onToggleAddForm,
}: SessionHeaderProps) {
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Generate session name from createdAt
  const sessionName = new Date(session.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-divider-secondary px-3 py-3 sm:px-4 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-content-primary sm:text-2xl lg:text-3xl">
          {template.name}{' '}
          <span className="text-sm sm:text-base text-content-tertiary">
            · {formatSessionDate(session.createdAt, showTime)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Clear button */}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-divider-tertiary bg-surface-primary px-3 py-2 text-sm font-medium text-content-secondary hover:bg-interactive-hover"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={onCycleViewMode}
            className="rounded-lg border border-divider-tertiary bg-surface-primary p-3 hover:bg-interactive-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
            title={`Cycle view - ${viewModeLabel}`}
            aria-label={`Cycle view - ${viewModeLabel}`}
          >
            <ViewModeIcon className="h-5 w-5" />
          </button>

          {/* Add/Edit button */}
          {onToggleAddForm && (
            <button
              type="button"
              onClick={onToggleAddForm}
              className={`rounded-lg border px-3 py-3 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                showAddForm
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-600'
                  : 'border-divider-tertiary bg-surface-primary text-content-secondary hover:bg-interactive-hover'
              }`}
              title="Toggle edit mode"
              aria-label="Toggle edit mode"
            >
              <div className="flex items-center gap-1">
                <Plus className="h-5 w-5" />
                <Pencil className="h-5 w-5" />
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={onFinishSession}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Done
          </button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-divider-tertiary bg-surface-primary p-3 hover:bg-interactive-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="More options"
              >
                <MoreVertical className="h-5 w-5 text-content-secondary" />
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
        template={template}
        sessionId={sessionId}
        sessionName={sessionName}
        account={me}
      />
    </>
  );
}
