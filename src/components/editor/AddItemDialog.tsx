import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ItemInput, type ItemInputValue } from '@/components/ui/ItemInput';
import type { AutocompleteDomain } from '@/lib/categorization/types';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem: (
    name: string,
    defaultQuantity?: string,
    categoryInfo?: {
      category: string;
      categoryName: string;
      subcategory?: string;
      subcategoryName?: string;
    },
  ) => void;
  onAddCategory: (name: string) => void;
  folderName?: string;
  autocompleteDomain?: AutocompleteDomain;
}

export function AddItemDialog({
  open,
  onOpenChange,
  onAddItem,
  onAddCategory,
  folderName,
  autocompleteDomain = 'grocery',
}: AddItemDialogProps) {
  const handleSubmit = (value: ItemInputValue) => {
    if (value.type === 'item') {
      onAddItem(value.name, value.defaultQuantity, value.categoryInfo);
    } else {
      onAddCategory(value.name);
    }
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Item or Category</DialogTitle>
          <DialogDescription>
            {folderName ? `Add to "${folderName}"` : 'Add a new item or category to your template'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ItemInput
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            showTypeToggle={true}
            showQuantityField={true}
            clearOnSubmit={false}
            autoFocus={true}
            variant="stacked"
            autocompleteDomain={autocompleteDomain}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
