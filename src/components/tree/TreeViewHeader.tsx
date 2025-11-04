import { useDroppable } from '@dnd-kit/core';
import { Download, LogOut, MoreVertical, Plus, Upload } from 'lucide-react';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TreeViewHeaderProps {
  isDragging: boolean;
  canCreateFolderOrList: boolean;
  canEditOrUse: boolean;
  onHeaderClick: () => void;
  onEditTemplate: () => void;
  onUseTemplate: () => void;
  onAddFolder: () => void;
  onAddTemplate: () => void;
  onExport: () => void;
  onImport: () => void;
  onSignOut?: () => void;
}

/**
 * Root-level header and drop zone for the main tree view.
 * Acts as a droppable target for moving folders to root level.
 * Styled to integrate with the tree structure.
 */
export function TreeViewHeader({
  isDragging,
  canCreateFolderOrList,
  canEditOrUse,
  onHeaderClick,
  onEditTemplate,
  onUseTemplate,
  onAddFolder,
  onAddTemplate,
  onExport,
  onImport,
  onSignOut,
}: TreeViewHeaderProps) {
  // Droppable setup for root-level drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'drop-__ROOT_DROP_ZONE__',
    data: { path: '__ROOT_DROP_ZONE__' },
  });

  return (
    <div
      ref={setDropRef}
      className={`px-4 py-4 border-b transition-all ${
        isDragging && isOver
          ? 'bg-green-50 border-green-500 border-2 border-dashed'
          : isDragging
            ? 'bg-neutral-50 border-neutral-200 border-2 border-dashed'
            : 'bg-white border-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onHeaderClick}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <BubbleListIcon className="h-8 w-8" size={32} />
          <h1 className="text-3xl font-bold text-neutral-900">BubbleList</h1>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditTemplate}
            disabled={!canEditOrUse}
            className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
          >
            Edit List
          </button>
          <button
            type="button"
            onClick={onUseTemplate}
            disabled={!canEditOrUse}
            className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
          >
            Use List
          </button>
          <button
            type="button"
            onClick={onAddFolder}
            disabled={!canCreateFolderOrList}
            className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            New Folder
          </button>
          <button
            type="button"
            onClick={onAddTemplate}
            disabled={!canCreateFolderOrList}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-600"
          >
            <Plus className="h-4 w-4" />
            New List
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 bg-white p-2 hover:bg-neutral-50"
                aria-label="More options"
              >
                <MoreVertical className="h-5 w-5 text-neutral-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </DropdownMenuItem>
              {onSignOut && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
