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
  simplifiedUI?: boolean;
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
  simplifiedUI = false,
  showAddForm = false,
  onClear,
  onToggleAddForm,
}: SessionHeaderProps) {
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Generate session name from createdAt
  const sessionName = new Date(session.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">
          {template.name}{' '}
          <span className="text-neutral-500">
            · {formatSessionDate(session.createdAt, showTime)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Simplified UI: Clear button */}
          {simplifiedUI && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={onCycleViewMode}
            className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
            title={`Cycle view - ${viewModeLabel}`}
            aria-label={`Cycle view - ${viewModeLabel}`}
          >
            <ViewModeIcon className="h-4 w-4" />
          </button>

          {/* Simplified UI: Add button */}
          {simplifiedUI && onToggleAddForm && (
            <button
              type="button"
              onClick={onToggleAddForm}
              className={`rounded-lg border px-2 py-2 transition-colors ${
                showAddForm
                  ? 'border-green-500 bg-green-50 text-green-600'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
              title="Add item or category"
              aria-label="Add item or category"
            >
              <div className="flex items-center gap-1">
                <Plus className="h-4 w-4" />
                <Pencil className="h-4 w-4" />
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

          {/* Classic UI: More menu */}
          {!simplifiedUI && (
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
          )}
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
