import { lazy, Suspense } from 'react';
import { UpgradeDialog } from '@/components/billing';
import { useRowboat } from '@/jazz';
import type { DialogName, DialogState } from '@/lib/useDialogManager';
import type { FolderRow } from '@/schema/folder';
import * as subscriptionService from '@/services/subscriptionService';
import * as userSettingsService from '@/services/userSettingsService';
import { AddFolderDialog } from './AddFolderDialog';

// Lazy load heavy dialog components
const ProfileDialog = lazy(() =>
  import('@/components/auth/ProfileDialog').then((m) => ({ default: m.ProfileDialog })),
);
const ExportDialog = lazy(() =>
  import('@/components/export/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const SessionExportDialog = lazy(() =>
  import('@/components/export/SessionExportDialog').then((m) => ({
    default: m.SessionExportDialog,
  })),
);
const ImportDialog = lazy(() =>
  import('@/components/import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

/**
 * Session export data for the SessionExportDialog
 */
export interface SessionExportData {
  templateId: string;
  sessionId: string;
}

interface DialogManagerProps {
  /** Current dialog state from useDialogManager */
  dialogs: DialogState;
  /** Function to set a specific dialog's open state */
  setDialogOpen: (dialog: DialogName, open: boolean) => void;
  /** Parent folder for import operations (creating a new template under a selected folder) */
  importParentFolder?: FolderRow;
  /** Handler for adding folders/templates */
  onAddFolder: (name: string, isTemplate: boolean) => void;
  /** Optional upgrade reason message */
  upgradeReason?: string;
  /** Callback when upgrade dialog closes */
  onUpgradeDialogClose?: () => void;
  /** Session export data */
  sessionExportData: SessionExportData | null;
  /** Templates for session export lookup */
  templates: FolderRow[];
  /** Auth callbacks */
  authCallbacks?: {
    onSignOut?: () => void;
    onDeleteAccount?: () => void;
  };
}

/**
 * DialogManager - Centralizes all dialog rendering for AppContainer.
 *
 * Rowboat port: dialogs read the graph (`g`) themselves via `useRowboat()`/`useSelect()` (see
 * `ExportDialog`/`SessionExportDialog`/`ImportDialog`/`UpgradeDialog`) rather than being handed a
 * Jazz `Account`, so this component no longer takes (or threads through) an `account` prop.
 */
export function DialogManager({
  dialogs,
  setDialogOpen,
  importParentFolder,
  onAddFolder,
  upgradeReason,
  onUpgradeDialogClose,
  sessionExportData,
  templates,
  authCallbacks,
}: DialogManagerProps) {
  const g = useRowboat();

  return (
    <>
      {/* Add Folder Dialog */}
      <AddFolderDialog
        open={dialogs.showAddFolder}
        onOpenChange={(open) => setDialogOpen('showAddFolder', open)}
        onAdd={onAddFolder}
      />

      {/* Add Template Dialog */}
      <AddFolderDialog
        open={dialogs.showAddTemplate}
        onOpenChange={(open) => setDialogOpen('showAddTemplate', open)}
        onAdd={onAddFolder}
        defaultIsTemplate={true}
        title="New List"
        description="Create a new list folder for frequently purchased items."
      />

      {/* Export Dialog */}
      <Suspense fallback={null}>
        <ExportDialog
          open={dialogs.showExport}
          onOpenChange={(open) => setDialogOpen('showExport', open)}
        />
      </Suspense>

      {/* Import Dialog */}
      <Suspense fallback={null}>
        <ImportDialog
          open={dialogs.showImport}
          onOpenChange={(open) => setDialogOpen('showImport', open)}
          parentFolder={importParentFolder}
        />
      </Suspense>

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={dialogs.showUpgrade}
        onOpenChange={(open) => {
          setDialogOpen('showUpgrade', open);
          if (!open) {
            onUpgradeDialogClose?.();
          }
        }}
        message={upgradeReason}
      />

      {/* Session Export Dialog */}
      {sessionExportData &&
        (() => {
          const template = templates.find((t) => t.id === sessionExportData.templateId);
          const session = template?.sessions.find((s) => s.id === sessionExportData.sessionId);
          if (template && session) {
            // Generate session name from createdAt
            const sessionName = new Date(session.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
            return (
              <Suspense fallback={null}>
                <SessionExportDialog
                  open={dialogs.showSessionExport}
                  onOpenChange={(open) => setDialogOpen('showSessionExport', open)}
                  template={template}
                  sessionId={sessionExportData.sessionId}
                  sessionName={sessionName}
                />
              </Suspense>
            );
          }
          return null;
        })()}

      {/* Profile Dialog */}
      {authCallbacks?.onSignOut && authCallbacks?.onDeleteAccount && (
        <Suspense fallback={null}>
          <ProfileDialog
            open={dialogs.showProfile}
            onOpenChange={(open) => setDialogOpen('showProfile', open)}
            onSignOut={authCallbacks.onSignOut}
            onDeleteAccount={authCallbacks.onDeleteAccount}
            defaultAutocompleteDomain={userSettingsService.getDefaultAutocompleteDomain(g)}
            enableAutoCategorization={userSettingsService.getEnableAutoCategorization(g)}
            onChangeDefaultAutocompleteDomain={(domain) =>
              userSettingsService.setDefaultAutocompleteDomain(g, domain)
            }
            onToggleAutoCategorization={() => userSettingsService.toggleEnableAutoCategorization(g)}
            subscriptionTier={subscriptionService.getSubscriptionTier(g)}
            listCount={subscriptionService.countUserLists(g)}
            maxLists={subscriptionService.getMaxLists(g)}
            isBeta={subscriptionService.isBetaUser(g)}
            onUpgradeClick={() => {
              setDialogOpen('showProfile', false);
              setDialogOpen('showUpgrade', true);
            }}
            onManageBillingClick={() => subscriptionService.redirectToPortal()}
          />
        </Suspense>
      )}
    </>
  );
}
