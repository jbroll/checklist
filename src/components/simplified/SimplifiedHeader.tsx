import { Plus } from 'lucide-react';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SimplifiedHeaderProps {
  templateName: string;
  sessionDate: string;
  viewMode: 'zone' | 'flat';
  showAddForm: boolean;
  onDone: () => void;
  onClear: () => void;
  onViewModeToggle: () => void;
  onToggleAddForm: () => void;
}

/**
 * SimplifiedHeader - Header component for simplified session view
 * Styled to match the classic TreeViewHeader
 * Contains Done button, Clear button, view mode toggle, and Add button
 */
export function SimplifiedHeader({
  templateName,
  sessionDate,
  viewMode,
  showAddForm,
  onDone,
  onClear,
  onViewModeToggle,
  onToggleAddForm,
}: SimplifiedHeaderProps) {
  return (
    <header className="px-4 py-4 border-b bg-white border-neutral-100">
      <div className="flex items-center justify-between">
        {/* Left: Icon + Template name with session info */}
        <div className="flex items-center gap-3">
          <BubbleListIcon className="h-8 w-8" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">{templateName}</h1>
            <p className="text-sm text-neutral-500">Session: {sessionDate}</p>
          </div>
        </div>

        {/* Right: Action buttons */}
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onClear}
                  variant="outline"
                  size="icon"
                  aria-label="Clear all items"
                >
                  Clear
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear All</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onViewModeToggle}
                  variant="outline"
                  size="icon"
                  aria-label={`Switch to ${viewMode === 'zone' ? 'flat' : 'zone'} view`}
                >
                  {viewMode === 'zone' ? 'Flat' : 'Zone'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{viewMode === 'zone' ? 'Flat View' : 'Zone View'}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onToggleAddForm}
                  variant={showAddForm ? 'secondary' : 'primary'}
                  size="icon"
                  aria-label={showAddForm ? 'Close add form' : 'Add item'}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showAddForm ? 'Close' : 'Add Item'}</p>
              </TooltipContent>
            </Tooltip>
            <Button onClick={onDone} variant="primary">
              Done
            </Button>
          </div>
        </TooltipProvider>
      </div>
    </header>
  );
}
