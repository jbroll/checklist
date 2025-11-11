import { createContext, useContext, useState, type ReactNode } from 'react';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface AlertOptions {
  title: string;
  message: string;
  buttonText?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'secondary';
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
  options: AlertOptions | ConfirmOptions | null;
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

  const showAlert = (options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setDialogState({
        type: 'alert',
        options,
        resolve,
      });
    });
  };

  const showConfirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        type: 'confirm',
        options,
        resolve,
      });
    });
  };

  const handleAlertClose = () => {
    if (dialogState.resolve) {
      dialogState.resolve(undefined);
    }
    setDialogState({ type: null, options: null, resolve: null });
  };

  const handleConfirmClose = (confirmed: boolean) => {
    if (dialogState.resolve) {
      dialogState.resolve(confirmed);
    }
    setDialogState({ type: null, options: null, resolve: null });
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {dialogState.type === 'alert' && dialogState.options && (
        <AlertDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) handleAlertClose();
          }}
          title={(dialogState.options as AlertOptions).title}
          message={(dialogState.options as AlertOptions).message}
          buttonText={(dialogState.options as AlertOptions).buttonText}
        />
      )}

      {dialogState.type === 'confirm' && dialogState.options && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) handleConfirmClose(false);
          }}
          onConfirm={() => handleConfirmClose(true)}
          onCancel={() => handleConfirmClose(false)}
          title={(dialogState.options as ConfirmOptions).title}
          message={(dialogState.options as ConfirmOptions).message}
          confirmText={(dialogState.options as ConfirmOptions).confirmText}
          cancelText={(dialogState.options as ConfirmOptions).cancelText}
          variant={(dialogState.options as ConfirmOptions).variant}
        />
      )}
    </DialogContext.Provider>
  );
}
