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
import { autoCategorize, CATEGORIES, type Category } from '@/schemas';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, category: Category, defaultQuantity?: string) => void;
  folderName?: string;
}

export function AddItemDialog({ open, onOpenChange, onAdd, folderName }: AddItemDialogProps) {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [defaultQuantity, setDefaultQuantity] = useState('');

  const handleItemNameChange = (name: string) => {
    setItemName(name);
    // Auto-categorize as user types
    if (name.trim()) {
      setCategory(autoCategorize(name));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (itemName.trim()) {
      onAdd(itemName.trim(), category, defaultQuantity.trim() || undefined);
      setItemName('');
      setCategory('other');
      setDefaultQuantity('');
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setItemName('');
    setCategory('other');
    setDefaultQuantity('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Template Item</DialogTitle>
          <DialogDescription>
            {folderName ? `Add an item to "${folderName}"` : 'Add a new item to your templates'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Item Name</Label>
              <input
                id="item-name"
                type="text"
                value={itemName}
                onChange={(e) => handleItemNameChange(e.target.value)}
                placeholder="e.g., Milk, Bananas, Bread"
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              >
                {(Object.keys(CATEGORIES) as Category[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORIES[cat].icon} {CATEGORIES[cat].name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                Category is auto-detected but you can change it
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="default-quantity">Default Quantity (Optional)</Label>
              <input
                id="default-quantity"
                type="text"
                value={defaultQuantity}
                onChange={(e) => setDefaultQuantity(e.target.value)}
                placeholder="e.g., 2 lbs, 1 gallon, 6 pack"
                className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
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
              disabled={!itemName.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Item
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
