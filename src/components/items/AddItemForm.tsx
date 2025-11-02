import type { InstanceOfSchema } from 'jazz-tools';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { autoCategorize, type GroceriesAccount, GroceryItem, type GroceryList } from '@/schemas';

interface AddItemFormProps {
  list: InstanceOfSchema<typeof GroceryList>;
  account: InstanceOfSchema<typeof GroceriesAccount>;
}

export function AddItemForm({ list, account }: AddItemFormProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Auto-detect category based on item name
    const category = autoCategorize(name.trim());

    // Create new grocery item
    const newItem = GroceryItem.create(
      {
        name: name.trim(),
        category,
        checked: false,
        archived: false,
        addedBy: account,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: account },
    );

    // Add to list using Jazz's push method
    list.items.$jazz.push(newItem);
    list.$jazz.set('updatedAt', new Date());

    // Reset form
    setName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add an item..."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 placeholder-neutral-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </form>
  );
}
