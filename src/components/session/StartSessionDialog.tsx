import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

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
            <FormField
              label="Session Name (Optional)"
              htmlFor="session-name"
              helperText="Auto-generated names use the format [YYYY-MM-DD HH:MM]"
            >
              <Input
                id="session-name"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={`Leave empty for auto-generated name: ${generateDefaultName()}`}
                autoFocus
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleCancel} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Start Shopping
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
