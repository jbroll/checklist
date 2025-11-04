import type { InstanceOfSchema } from 'jazz-tools';
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
import { Label } from '@/components/ui/label';
import type { TemplateItem } from '@/schemas';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem: (name: string, parentPath?: string, defaultQuantity?: string) => void;
  onAddCategory: (name: string, parentPath?: string, color?: string) => void;
  folderName?: string;
  // Available categories to select as parent
  categories?: readonly (InstanceOfSchema<typeof TemplateItem> | null)[];
}

export function AddItemDialog({
  open,
  onOpenChange,
  onAddItem,
  onAddCategory,
  folderName,
  categories = [],
}: AddItemDialogProps) {
  const [itemType, setItemType] = useState<'item' | 'category'>('item');
  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState<string>('');
  const [defaultQuantity, setDefaultQuantity] = useState('');
  const [color, setColor] = useState('#6b7280');

  // Filter valid categories
  const validCategories = categories.filter((cat): cat is InstanceOfSchema<typeof TemplateItem> => {
    return cat !== null && !cat.archived && cat.type === 'category';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      if (itemType === 'item') {
        onAddItem(name.trim(), parentPath || undefined, defaultQuantity.trim() || undefined);
      } else {
        onAddCategory(name.trim(), parentPath || undefined, color || undefined);
      }
      handleReset();
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setName('');
    setParentPath('');
    setDefaultQuantity('');
    setColor('#6b7280');
    setItemType('item');
  };

  const handleCancel = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add {itemType === 'item' ? 'Item' : 'Category'}</DialogTitle>
          <DialogDescription>
            {folderName
              ? `Add a ${itemType} to "${folderName}"`
              : `Add a new ${itemType} to your template`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Type Toggle */}
            <div className="grid gap-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setItemType('item')}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    itemType === 'item'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Item
                </button>
                <button
                  type="button"
                  onClick={() => setItemType('category')}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    itemType === 'category'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Category
                </button>
              </div>
            </div>

            {/* Name */}
            <FormField label="Name" htmlFor="name" required>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  itemType === 'item' ? 'e.g., Apples, Milk, Bread' : 'e.g., Produce, Dairy'
                }
                autoFocus
              />
            </FormField>

            {/* Parent Category */}
            {validCategories.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="parent">Parent Category (Optional)</Label>
                <select
                  id="parent"
                  value={parentPath}
                  onChange={(e) => setParentPath(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                >
                  <option value="">-- None (Top Level) --</option>
                  {validCategories.map((cat) => (
                    <option key={cat.$jazz.id} value={cat.path}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Item-specific: Default Quantity */}
            {itemType === 'item' && (
              <FormField label="Default Quantity (Optional)" htmlFor="default-quantity">
                <Input
                  id="default-quantity"
                  type="text"
                  value={defaultQuantity}
                  onChange={(e) => setDefaultQuantity(e.target.value)}
                  placeholder="e.g., 2 lbs, 1 gallon, 6 pack"
                />
              </FormField>
            )}

            {/* Category-specific: Color */}
            {itemType === 'category' && (
              <div className="grid gap-2">
                <Label htmlFor="color">Color (Optional)</Label>
                <div className="flex gap-2">
                  <input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-16 rounded-md border border-neutral-300 bg-white"
                  />
                  <Input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#6b7280"
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleCancel} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()} variant="primary">
              Add {itemType === 'item' ? 'Item' : 'Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
