import { LayoutGrid, LogOut, User, UserX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onSwitchView?: () => void;
  switchViewLabel?: string;
}

export function ProfileDialog({
  open,
  onOpenChange,
  onSignOut,
  onDeleteAccount,
  onSwitchView,
  switchViewLabel = 'Basic View',
}: ProfileDialogProps) {
  const handleSignOut = () => {
    onOpenChange(false);
    onSignOut();
  };

  const handleDeleteAccount = () => {
    onOpenChange(false);
    onDeleteAccount();
  };

  const handleSwitchView = () => {
    onSwitchView?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
            <User className="h-6 w-6 text-neutral-600" />
          </div>
          <DialogTitle className="text-center">Profile</DialogTitle>
          <DialogDescription className="text-center">
            Manage your account settings
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          {onSwitchView && (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleSwitchView}
            >
              <LayoutGrid className="h-4 w-4" />
              {switchViewLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDeleteAccount}
          >
            <UserX className="h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
