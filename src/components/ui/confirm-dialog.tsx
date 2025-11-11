import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  /** Confirm button text (default: "Confirm") */
  confirmText?: string;
  /** Cancel button text (default: "Cancel") */
  cancelText?: string;
  /** Variant for confirm button (default: "danger" for dangerous actions) */
  variant?: 'primary' | 'danger' | 'secondary';
}

/**
 * ConfirmDialog - A modal dialog for confirming actions.
 * Replaces browser confirm() with a proper modal overlay.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <Button onClick={handleCancel} variant="secondary" autoFocus>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} variant={variant}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
