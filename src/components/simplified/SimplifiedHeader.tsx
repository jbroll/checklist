import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="mb-6">
      {/* Title and session info */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">{templateName}</h1>
          <p className="text-sm text-neutral-500">Session: {sessionDate}</p>
        </div>
        <Button onClick={onDone} variant="primary">
          Done
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={onClear} variant="outline" size="sm">
            Clear
          </Button>
          <Button onClick={onViewModeToggle} variant="outline" size="sm">
            {viewMode === 'zone' ? 'Flat View' : 'Zone View'}
          </Button>
        </div>
        <Button onClick={onToggleAddForm} variant={showAddForm ? 'secondary' : 'primary'} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {showAddForm ? 'Close' : 'Add Item'}
        </Button>
      </div>
    </div>
  );
}
