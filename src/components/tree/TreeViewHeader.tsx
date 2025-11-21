import { useDroppable } from '@dnd-kit/core';
import {
  Archive,
  CheckSquare,
  Download,
  FolderPlus,
  LayoutGrid,
  ListPlus,
  LogIn,
  LogOut,
  MoreVertical,
  Pencil,
  Upload,
} from 'lucide-react';
import { BubbleListIcon } from '@/components/ui/BubbleListIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TreeViewHeaderProps {
  isDragging?: boolean;
  canCreateFolderOrList: boolean;
  canEditOrUse: boolean;
  showArchived?: boolean;
  hideArchivedToggle?: boolean;
  onHeaderClick: () => void;
  onEditTemplate: () => void;
  onUseTemplate: () => void;
  onAddFolder: () => void;
  onAddTemplate: () => void;
  onExport: () => void;
  onImport: () => void;
  onToggleShowArchived?: () => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  isAuthenticated?: boolean;
  onSwitchView?: () => void;
  switchViewLabel?: string;
}

/**
 * Root-level header and drop zone for the main tree view.
 * Acts as a droppable target for moving folders to root level.
 * Styled to integrate with the tree structure.
 * Can be reused in simplified view by setting isDragging to undefined.
 */
export function TreeViewHeader({
  isDragging = false,
  canCreateFolderOrList,
  canEditOrUse,
  showArchived = false,
  hideArchivedToggle = false,
  onHeaderClick,
  onEditTemplate,
  onUseTemplate,
  onAddFolder,
  onAddTemplate,
  onExport,
  onImport,
  onToggleShowArchived,
  onSignOut,
  onSignIn,
  isAuthenticated = false,
  onSwitchView,
  switchViewLabel = 'Basic View',
}: TreeViewHeaderProps) {
  // Droppable setup for root-level drops (always called for hooks rules)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'drop-__ROOT_DROP_ZONE__',
    data: { path: '__ROOT_DROP_ZONE__' },
  });

  // Only use drag-and-drop functionality when enabled
  const effectiveSetDropRef = isDragging !== undefined ? setDropRef : undefined;
  const effectiveIsOver = isDragging !== undefined ? isOver : false;

  return (
    <header
      ref={effectiveSetDropRef}
      className={`px-3 py-3 sm:px-4 sm:py-4 border-b transition-all ${
        isDragging && effectiveIsOver
          ? 'bg-green-50 border-green-500 border-2 border-dashed'
          : isDragging
            ? 'bg-neutral-50 border-neutral-200 border-2 border-dashed'
            : 'bg-white border-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onHeaderClick}
          className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity min-h-[44px]"
          aria-label="Return to main view"
        >
          <BubbleListIcon className="h-7 w-7 sm:h-8 sm:w-8" size={32} />
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl lg:text-3xl">BubbleList</h1>
        </button>
        <TooltipProvider>
          <div className="flex items-center gap-2">
            {canEditOrUse && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={onEditTemplate}
                      variant="outline"
                      size="icon"
                      aria-label="Edit list"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit List</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={onUseTemplate}
                      variant="outline"
                      size="icon"
                      aria-label="Use list"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Use List</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {canCreateFolderOrList && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={onAddFolder}
                      variant="outline"
                      size="icon"
                      aria-label="New folder"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New Folder</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={onAddTemplate}
                      variant="primary"
                      size="icon"
                      aria-label="New list"
                    >
                      <ListPlus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New List</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="More options">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onImport}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                {!hideArchivedToggle && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={showArchived}
                      onCheckedChange={onToggleShowArchived}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Show Archived
                    </DropdownMenuCheckboxItem>
                  </>
                )}
                {(onSignOut || onSignIn) && (
                  <>
                    <DropdownMenuSeparator />
                    {onSwitchView && (
                      <DropdownMenuItem onClick={onSwitchView}>
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        {switchViewLabel}
                      </DropdownMenuItem>
                    )}
                    {isAuthenticated && onSignOut ? (
                      <DropdownMenuItem onClick={onSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </DropdownMenuItem>
                    ) : (
                      onSignIn && (
                        <DropdownMenuItem onClick={onSignIn}>
                          <LogIn className="mr-2 h-4 w-4" />
                          Sign In
                        </DropdownMenuItem>
                      )
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      </div>
    </header>
  );
}
