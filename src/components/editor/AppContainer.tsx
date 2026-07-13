import { useState } from 'react';
import { AddFolderDialog } from '@/components/editor/AddFolderDialog';
import { TreeView } from '@/components/tree';
import { ItemLimitExceededError, useCheckListHierarchy } from '@/hooks';
import { usePort } from '@/jazz';
import { useDialog } from '@/lib/dialog-context';
import { useDialogManager } from '@/lib/useDialogManager';
import { useTemplateNavigation } from '@/lib/useTemplateNavigation';

interface AppContainerProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  isAuthenticated: boolean;
}

/**
 * AppContainer — slice 1 (folders-only). Renders the folder tree over the rowboat graph.
 *
 * The pre-port version of this component also drove template/session selection, the
 * subscription/upgrade banner, and export/import dialogs, all keyed off a Jazz `Account`.
 * None of that is in the rowboat `Folder` table yet (items/sessions/billing land in a later
 * slice — see `docs/superpowers/d-t4-report.md`), so this rewrite drops that plumbing
 * entirely rather than stub it out inline; the removed components (`SessionView`,
 * `DialogManager`, `UpgradeBanner`, `ExportDialog`/`ImportDialog`) are untouched on disk and
 * still compile against the unchanged Jazz `Account`/`FolderNode` schema in `src/schema/index.ts`
 * — they're just not wired into this tree until that slice.
 */
export function AppContainer({
  onSignOut,
  onSignIn,
  onDeleteAccount,
  isAuthenticated,
}: AppContainerProps) {
  const { author, mintGroup } = usePort();
  const { showAlert } = useDialog();
  const { dialogs, openDialog, setDialogOpen } = useDialogManager();
  const { selectedFolderId, selectFolder, clearSelection } = useTemplateNavigation();

  const { addFolder } = useCheckListHierarchy({
    createdBy: author ?? 'anon',
    mintGroup,
  });

  const [pendingIsTemplate, setPendingIsTemplate] = useState(false);

  const handleAddFolder = async (name: string, isTemplate: boolean) => {
    try {
      await addFolder(name, selectedFolderId ?? null, isTemplate ? 'template-folder' : 'folder');
    } catch (error) {
      if (error instanceof ItemLimitExceededError) {
        await showAlert({
          title: 'List Limit Reached',
          message: `You've reached your limit of ${error.maxItems} lists. Upgrade your plan to create more.`,
        });
      } else {
        throw error;
      }
    }
  };

  const handleHeaderClick = () => {
    clearSelection();
  };

  return (
    <div className="h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      <main
        id="main-content"
        className="mx-auto max-w-full sm:max-w-3xl lg:max-w-4xl w-full flex-1 flex flex-col min-h-0 p-3 sm:p-4 lg:p-6"
      >
        <TreeView
          selectedFolderId={selectedFolderId}
          selectionHandlers={{
            onFolderSelect: selectFolder,
          }}
          headerActions={{
            onHeaderClick: handleHeaderClick,
            onAddFolder: () => {
              setPendingIsTemplate(false);
              openDialog('showAddFolder');
            },
            // TODO(slice-2): templates carry items/sessions, not ported in this slice —
            // "New List" reuses the folder dialog with the template flag until then.
            onAddTemplate: () => {
              setPendingIsTemplate(true);
              openDialog('showAddFolder');
            },
          }}
          authProps={{
            onSignOut,
            onSignIn,
            onDeleteAccount,
            isAuthenticated,
            showProfileDialog: dialogs.showProfile,
            onShowProfileDialogChange: (show) => setDialogOpen('showProfile', show),
          }}
          // TODO(slice-2): archived-session toggle and trash both depend on items/sessions
          // (not ported yet) — hide those controls, keep per-folder archive/delete.
          archiveSettings={{
            hideArchivedSessionsToggle: true,
          }}
        />

        <AddFolderDialog
          open={dialogs.showAddFolder}
          onOpenChange={(open) => setDialogOpen('showAddFolder', open)}
          onAdd={handleAddFolder}
          defaultIsTemplate={pendingIsTemplate}
        />
      </main>
    </div>
  );
}
