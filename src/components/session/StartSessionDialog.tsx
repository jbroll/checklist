import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (name: string) => void;
  folderName?: string;
}

export function StartSessionDialog({
  open,
  onOpenChange,
  onStart,
  folderName,
}: StartSessionDialogProps) {
  const [sessionName, setSessionName] = useState('');

  // Generate default session name based on current date
  const generateDefaultName = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 5); // HH:MM
    return `[${dateStr} ${timeStr}]`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sessionName.trim() || generateDefaultName();
    onStart(name);
    setSessionName('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setSessionName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Start Shopping Session</DialogTitle>
          <DialogDescription>
            {folderName
              ? `Create a new shopping session for "${folderName}"`
              : 'Create a new shopping session from this template'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="session-name">Session Name (Optional)</Label>
              <input
                id="session-name"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={`Leave empty for auto-generated name: ${generateDefaultName()}`}
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
              <p className="text-xs text-neutral-500">
                Auto-generated names use the format [YYYY-MM-DD HH:MM]
              </p>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Start Shopping
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
