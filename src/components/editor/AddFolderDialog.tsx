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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, isTemplate: boolean) => void;
  defaultIsTemplate?: boolean;
  title?: string;
  description?: string;
}

export function AddFolderDialog({
  open,
  onOpenChange,
  onAdd,
  defaultIsTemplate = false,
  title = 'Create New Folder',
  description = 'Create a folder to organize your list items.',
}: AddFolderDialogProps) {
  const [folderName, setFolderName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      onAdd(folderName.trim(), defaultIsTemplate);
      setFolderName('');
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setFolderName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">{defaultIsTemplate ? 'List Name' : 'Folder Name'}</Label>
              <Input
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={
                  defaultIsTemplate
                    ? 'e.g., Weekly Staples, Monthly Shopping'
                    : 'e.g., Groceries, Household'
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleCancel} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" disabled={!folderName.trim()} variant="primary">
              {defaultIsTemplate ? 'Create List' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
