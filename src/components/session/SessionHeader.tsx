import type { LucideIcon } from 'lucide-react';
import { Pencil, Plus } from 'lucide-react';

interface SessionHeaderProps {
  templateName: string;
  showAddForm: boolean;
  onToggleAddForm: (show: boolean) => void;
  onClearOrNew: () => void;
  onCycleViewMode: () => void;
  getViewModeLabel: () => string;
  getViewModeIcon: () => LucideIcon;
  onBack: () => void;
}

/**
 * Header component for the session view.
 * Contains template name, view mode toggle, add/edit button, and navigation.
 */
export function SessionHeader({
  templateName,
  showAddForm,
  onToggleAddForm,
  onClearOrNew,
  onCycleViewMode,
  getViewModeLabel,
  getViewModeIcon,
  onBack,
}: SessionHeaderProps) {
  return (
    <div className="border-b border-divider-primary p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-content-primary sm:text-xl lg:text-2xl truncate">
          {templateName}
        </h1>
        {showAddForm ? (
          <button
            type="button"
            onClick={() => onToggleAddForm(false)}
            className="rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px] shrink-0"
          >
            Done
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            {/* New Button */}
            <button
              type="button"
              onClick={onClearOrNew}
              className="rounded border border-divider-primary bg-surface-elevated px-4 py-2 text-base font-medium text-content-primary hover:bg-interactive-hover min-h-[44px]"
            >
              New
            </button>
            {/* View Mode Toggle */}
            <button
              type="button"
              onClick={onCycleViewMode}
              className="flex items-center justify-center rounded bg-surface-tertiary p-3 text-content-primary hover:bg-interactive-hover min-h-[44px] min-w-[44px]"
              aria-label={`Switch to ${getViewModeLabel()} view`}
            >
              {(() => {
                const Icon = getViewModeIcon();
                return <Icon className="h-5 w-5" />;
              })()}
            </button>
            <button
              type="button"
              onClick={() => onToggleAddForm(true)}
              className="flex items-center gap-1.5 rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px]"
              aria-label="Add and edit items"
            >
              <Plus className="h-5 w-5" />
              <Pencil className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded bg-green-600 px-4 py-2 text-base text-white hover:bg-green-700 min-h-[44px]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
