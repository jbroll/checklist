import type { InstanceOfSchema } from 'jazz-tools';
import { lazy, Suspense } from 'react';
import { UpgradeDialog } from '@/components/billing';
import { iterateSessions } from '@/lib/jazz-types';
import type { DialogName, DialogState } from '@/lib/useDialogManager';
import type { Account, FolderNode, SessionData } from '@/schemas';
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
  /** Current account */
  account: InstanceOfSchema<typeof Account>;
  /** Parent folder for import operations */
  importParentFolder?: InstanceOfSchema<typeof FolderNode>;
  /** Handler for adding folders/templates */
  onAddFolder: (name: string, isTemplate: boolean) => void;
  /** Optional upgrade reason message */
  upgradeReason?: string;
  /** Callback when upgrade dialog closes */
  onUpgradeDialogClose?: () => void;
  /** Session export data */
  sessionExportData: SessionExportData | null;
  /** Templates for session export lookup */
  templates: Array<InstanceOfSchema<typeof FolderNode> | null | undefined>;
  /** Auth callbacks */
  authCallbacks?: {
    onSignOut?: () => void;
    onDeleteAccount?: () => void;
  };
}

/**
 * DialogManager - Centralizes all dialog rendering for AppContainer.
 *
 * This component consolidates dialog rendering to reduce complexity
 * in the main AppContainer component. Each dialog is lazily loaded
 * and rendered only when needed.
 */
export function DialogManager({
  dialogs,
  setDialogOpen,
  account,
  importParentFolder,
  onAddFolder,
  upgradeReason,
  onUpgradeDialogClose,
  sessionExportData,
  templates,
  authCallbacks,
}: DialogManagerProps) {
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  const accountAsAny = account as any;

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
          account={accountAsAny}
        />
      </Suspense>

      {/* Import Dialog */}
      <Suspense fallback={null}>
        <ImportDialog
          open={dialogs.showImport}
          onOpenChange={(open) => setDialogOpen('showImport', open)}
          account={accountAsAny}
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
        account={account}
        message={upgradeReason}
      />

      {/* Session Export Dialog */}
      {sessionExportData &&
        (() => {
          const template = templates.find((t) => t?.$jazz.id === sessionExportData.templateId);
          const sessions = iterateSessions<SessionData>(template?.sessions);
          const session = sessions.find((s: SessionData) => s?.id === sessionExportData.sessionId);
          if (template && session) {
            // Generate session name from createdAt
            const sessionName = new Date(session.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
            return (
              <Suspense fallback={null}>
                <SessionExportDialog
                  open={dialogs.showSessionExport}
                  onOpenChange={(open) => setDialogOpen('showSessionExport', open)}
                  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
                  template={template as any}
                  sessionId={sessionExportData.sessionId}
                  sessionName={sessionName}
                  account={accountAsAny}
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
            defaultAutocompleteDomain={userSettingsService.getDefaultAutocompleteDomain(account)}
            enableAutoCategorization={userSettingsService.getEnableAutoCategorization(account)}
            onChangeDefaultAutocompleteDomain={(domain) =>
              userSettingsService.setDefaultAutocompleteDomain(account, domain)
            }
            onToggleAutoCategorization={() =>
              userSettingsService.toggleEnableAutoCategorization(account)
            }
            subscriptionTier={subscriptionService.getSubscriptionTier(account)}
            listCount={subscriptionService.countUserLists(account)}
            maxLists={subscriptionService.getMaxLists(account)}
            isBeta={subscriptionService.isBetaUser(account)}
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
