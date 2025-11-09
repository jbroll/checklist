import { SimpleInputDialog } from '@/components/ui/simple-input-dialog';

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
  const handleSubmit = (name: string) => {
    onAdd(name, defaultIsTemplate);
  };

  return (
    <SimpleInputDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      title={title}
      description={description}
      inputLabel={defaultIsTemplate ? 'List Name' : 'Folder Name'}
      inputPlaceholder={
        defaultIsTemplate ? 'e.g., Weekly Staples, Monthly Shopping' : 'e.g., Groceries, Household'
      }
      submitButtonText={defaultIsTemplate ? 'Create List' : 'Create Folder'}
      required
    />
  );
}
