import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Base options shared by all dialog types */
interface BaseDialogOptions {
  title: string;
  message: string;
}

interface AlertOptions extends BaseDialogOptions {
  buttonText?: string;
}

interface ConfirmOptions extends BaseDialogOptions {
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'secondary';
}

type DialogOptions = AlertOptions | ConfirmOptions;

/** Type guard to check if options are for an alert dialog */
function isAlertOptions(
  type: 'alert' | 'confirm' | null,
  options: DialogOptions | null,
): options is AlertOptions {
  return type === 'alert' && options !== null;
}

/** Type guard to check if options are for a confirm dialog */
function isConfirmOptions(
  type: 'alert' | 'confirm' | null,
  options: DialogOptions | null,
): options is ConfirmOptions {
  return type === 'confirm' && options !== null;
}

interface DialogContextValue {
  showAlert: (options: AlertOptions) => Promise<void>;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

/**
 * Hook to access dialog functions
 * @returns {Object} Dialog functions: showAlert, showConfirm
 * @example
 * const { showAlert, showConfirm } = useDialog();
 * await showAlert({ title: "Error", message: "Something went wrong" });
 * const confirmed = await showConfirm({ title: "Delete?", message: "Are you sure?" });
 */
export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

interface DialogState {
  type: 'alert' | 'confirm' | null;
  options: DialogOptions | null;
  // biome-ignore lint/suspicious/noExplicitAny: resolve can be for Promise<void> or Promise<boolean>
  resolve: ((value: any) => void) | null;
}

/**
 * DialogProvider - Provides programmatic dialog access to all child components.
 * Wrap your app with this provider to enable useDialog() hook.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState>({
    type: null,
    options: null,
    resolve: null,
  });

  const showAlert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setDialogState({
        type: 'alert',
        options,
        resolve,
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        type: 'confirm',
        options,
        resolve,
      });
    });
  }, []);

  const contextValue = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);

  const handleAlertClose = useCallback(() => {
    setDialogState((state) => {
      state.resolve?.(undefined);
      return { type: null, options: null, resolve: null };
    });
  }, []);

  const handleConfirmClose = useCallback((confirmed: boolean) => {
    setDialogState((state) => {
      state.resolve?.(confirmed);
      return { type: null, options: null, resolve: null };
    });
  }, []);

  const alertOptions = isAlertOptions(dialogState.type, dialogState.options)
    ? dialogState.options
    : null;
  const confirmOptions = isConfirmOptions(dialogState.type, dialogState.options)
    ? dialogState.options
    : null;

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      {alertOptions && (
        <AlertDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) handleAlertClose();
          }}
          title={alertOptions.title}
          message={alertOptions.message}
          buttonText={alertOptions.buttonText}
        />
      )}

      {confirmOptions && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) handleConfirmClose(false);
          }}
          onConfirm={() => handleConfirmClose(true)}
          onCancel={() => handleConfirmClose(false)}
          title={confirmOptions.title}
          message={confirmOptions.message}
          confirmText={confirmOptions.confirmText}
          cancelText={confirmOptions.cancelText}
          variant={confirmOptions.variant}
        />
      )}
    </DialogContext.Provider>
  );
}
