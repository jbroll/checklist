import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  /** Button text (default: "OK") */
  buttonText?: string;
}

/**
 * AlertDialog - A modal dialog for displaying simple alert messages.
 * Replaces browser alert() with a proper modal overlay.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  message,
  buttonText = 'OK',
}: AlertDialogProps) {
  const handleClose = () => {
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
          <Button onClick={handleClose} variant="primary" autoFocus>
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
