import { useCallback, useState } from 'react';

/**
 * Dialog state interface for all managed dialogs in AppContainer
 */
export interface DialogState {
  showProfile: boolean;
  showImport: boolean;
  showExport: boolean;
  showAddFolder: boolean;
  showAddTemplate: boolean;
  showUpgrade: boolean;
  showSessionExport: boolean;
}

/**
 * Dialog names that can be opened/closed
 */
export type DialogName = keyof DialogState;

/**
 * Return type for useDialogManager hook
 */
export interface UseDialogManagerReturn {
  dialogs: DialogState;
  openDialog: (dialog: DialogName) => void;
  closeDialog: (dialog: DialogName) => void;
  closeAll: () => void;
  setDialogOpen: (dialog: DialogName, open: boolean) => void;
}

const initialDialogState: DialogState = {
  showProfile: false,
  showImport: false,
  showExport: false,
  showAddFolder: false,
  showAddTemplate: false,
  showUpgrade: false,
  showSessionExport: false,
};

/**
 * Hook to manage multiple dialog states in a centralized way.
 *
 * Consolidates dialog state management to reduce component complexity
 * and provide a consistent API for opening/closing dialogs.
 *
 * @example
 * ```tsx
 * const { dialogs, openDialog, closeDialog } = useDialogManager();
 *
 * // Open a dialog
 * openDialog('showProfile');
 *
 * // Close a dialog
 * closeDialog('showProfile');
 *
 * // Use in component
 * <ProfileDialog open={dialogs.showProfile} onOpenChange={(open) => setDialogOpen('showProfile', open)} />
 * ```
 */
export function useDialogManager(): UseDialogManagerReturn {
  const [dialogs, setDialogs] = useState<DialogState>(initialDialogState);

  const openDialog = useCallback((dialog: DialogName) => {
    setDialogs((prev) => ({ ...prev, [dialog]: true }));
  }, []);

  const closeDialog = useCallback((dialog: DialogName) => {
    setDialogs((prev) => ({ ...prev, [dialog]: false }));
  }, []);

  const closeAll = useCallback(() => {
    setDialogs(initialDialogState);
  }, []);

  const setDialogOpen = useCallback((dialog: DialogName, open: boolean) => {
    setDialogs((prev) => ({ ...prev, [dialog]: open }));
  }, []);

  return {
    dialogs,
    openDialog,
    closeDialog,
    closeAll,
    setDialogOpen,
  };
}
