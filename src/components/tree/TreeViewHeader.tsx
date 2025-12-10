import { useDroppable } from '@dnd-kit/core';
import {
  Archive,
  CheckSquare,
  Download,
  FolderPlus,
  Info,
  LayoutGrid,
  ListPlus,
  LogIn,
  Mail,
  MoreVertical,
  Pencil,
  Smartphone,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KjekitIcon, KjekitText } from '@/components/ui/KjekitIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TreeViewHeaderProps {
  isDragging?: boolean;
  canCreateFolderOrList: boolean;
  canEditOrUse: boolean;
  showArchivedTemplates?: boolean;
  showArchivedSessions?: boolean;
  hideArchivedTemplatesToggle?: boolean;
  hideArchivedSessionsToggle?: boolean;
  hasArchivedTemplates?: boolean;
  onHeaderClick: () => void;
  onEditTemplate: () => void;
  onUseTemplate: () => void;
  onAddFolder: () => void;
  onAddTemplate: () => void;
  onExport: () => void;
  onImport: () => void;
  onToggleShowArchivedTemplates?: () => void;
  onToggleShowArchivedSessions?: () => void;
  onEmptyTrash?: () => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  onPendingInvites?: () => void;
  isAuthenticated?: boolean;
  onSwitchView?: () => void;
  switchViewLabel?: string;
  showProfileDialog?: boolean;
  onShowProfileDialogChange?: (show: boolean) => void;
  canInstallApp?: boolean;
  onInstallApp?: () => void;
  onAbout?: () => void;
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
  showArchivedTemplates = false,
  showArchivedSessions = false,
  hideArchivedTemplatesToggle = false,
  hideArchivedSessionsToggle = false,
  hasArchivedTemplates = false,
  onHeaderClick,
  onEditTemplate,
  onUseTemplate,
  onAddFolder,
  onAddTemplate,
  onExport,
  onImport,
  onToggleShowArchivedTemplates,
  onToggleShowArchivedSessions,
  onEmptyTrash,
  onSignOut,
  onSignIn,
  onDeleteAccount,
  onPendingInvites,
  isAuthenticated = false,
  onSwitchView,
  switchViewLabel = 'Basic View',
  showProfileDialog: _showProfileDialog = false,
  onShowProfileDialogChange,
  canInstallApp = false,
  onInstallApp,
  onAbout,
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
          ? 'bg-green-50 dark:bg-green-900/30 border-green-500 border-2 border-dashed'
          : isDragging
            ? 'bg-surface-secondary border-divider-primary border-2 border-dashed'
            : 'bg-surface-elevated border-divider-secondary'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onHeaderClick}
          className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity min-h-[44px]"
          aria-label="kjekit - Return to main view"
        >
          <KjekitIcon className="h-7 w-7 sm:h-8 sm:w-8" size={32} />
          <h1 className="flex items-center gap-1">
            <KjekitText className="h-10 sm:h-11 lg:h-12" height={40} />
            <span className="text-xl font-bold text-content-primary sm:text-2xl lg:text-3xl">
              Lists
            </span>
          </h1>
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
            {!isAuthenticated && onSignIn && (
              <Button
                type="button"
                onClick={onSignIn}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
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
                {(!hideArchivedTemplatesToggle || !hideArchivedSessionsToggle) && (
                  <DropdownMenuSeparator />
                )}
                {!hideArchivedTemplatesToggle && (
                  <DropdownMenuCheckboxItem
                    checked={showArchivedTemplates}
                    onCheckedChange={onToggleShowArchivedTemplates}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Show Archived Lists
                  </DropdownMenuCheckboxItem>
                )}
                {!hideArchivedSessionsToggle && (
                  <DropdownMenuCheckboxItem
                    checked={showArchivedSessions}
                    onCheckedChange={onToggleShowArchivedSessions}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Show Archived Sessions
                  </DropdownMenuCheckboxItem>
                )}
                {!hideArchivedTemplatesToggle &&
                  showArchivedTemplates &&
                  hasArchivedTemplates &&
                  onEmptyTrash && (
                    <DropdownMenuItem onClick={onEmptyTrash} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Empty Trash
                    </DropdownMenuItem>
                  )}
                {(onSignOut || onSignIn || onPendingInvites || canInstallApp) && (
                  <>
                    <DropdownMenuSeparator />
                    {canInstallApp && onInstallApp && (
                      <DropdownMenuItem onClick={onInstallApp}>
                        <Smartphone className="mr-2 h-4 w-4" />
                        Install App
                      </DropdownMenuItem>
                    )}
                    {isAuthenticated && onPendingInvites && (
                      <DropdownMenuItem onClick={onPendingInvites}>
                        <Mail className="mr-2 h-4 w-4" />
                        Pending Invites
                      </DropdownMenuItem>
                    )}
                    {isAuthenticated &&
                    onSignOut &&
                    onDeleteAccount &&
                    onShowProfileDialogChange ? (
                      <DropdownMenuItem onClick={() => onShowProfileDialogChange(true)}>
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {onSwitchView && (
                          <DropdownMenuItem onClick={onSwitchView}>
                            <LayoutGrid className="mr-2 h-4 w-4" />
                            {switchViewLabel}
                          </DropdownMenuItem>
                        )}
                        {onSignIn && (
                          <DropdownMenuItem onClick={onSignIn}>
                            <LogIn className="mr-2 h-4 w-4" />
                            Sign In
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </>
                )}
                {onAbout && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onAbout}>
                      <Info className="mr-2 h-4 w-4" />
                      About
                    </DropdownMenuItem>
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
