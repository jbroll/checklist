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
  const [isTemplate, setIsTemplate] = useState(defaultIsTemplate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      onAdd(folderName.trim(), isTemplate);
      setFolderName('');
      setIsTemplate(defaultIsTemplate);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setFolderName('');
    setIsTemplate(defaultIsTemplate);
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
              <input
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={
                  defaultIsTemplate
                    ? 'e.g., Weekly Staples, Monthly Shopping'
                    : 'e.g., Groceries, Household'
                }
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>

            {!defaultIsTemplate && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is-template"
                    checked={isTemplate}
                    onChange={(e) => setIsTemplate(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-green-600 focus:ring-2 focus:ring-green-500/20"
                  />
                  <Label htmlFor="is-template" className="cursor-pointer">
                    Make this a list folder
                  </Label>
                </div>
                {isTemplate && (
                  <p className="text-xs text-neutral-600">
                    List folders contain reusable item templates for quick shopping sessions.
                  </p>
                )}
              </>
            )}
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
              disabled={!folderName.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {defaultIsTemplate ? 'Create List' : 'Create Folder'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
