import type { InstanceOfSchema } from 'jazz-tools';
import { ArrowLeft, Check, Edit2, X } from 'lucide-react';
import { useState } from 'react';
import { useCoState } from '@/lib/jazz';
import {
  CATEGORIES,
  type Category,
  type GroceriesAccount,
  type GroceryItem,
  GroceryList,
} from '@/schemas';
import { AddItemForm } from '../items/AddItemForm';
import { ItemRow } from '../items/ItemRow';

interface ListViewProps {
  listId: string;
  account: InstanceOfSchema<typeof GroceriesAccount>;
  onBack: () => void;
}

export function ListView({ listId, account, onBack }: ListViewProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  const list = useCoState(GroceryList, listId);

  if (!list) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading list...</p>
        </div>
      </div>
    );
  }

  const items = list.items || [];
  const activeItems = items.filter((item) => item && !item.archived);

  // Separate checked and unchecked items
  const uncheckedItems = activeItems.filter((item) => item && !item.checked);
  const checkedItems = activeItems.filter((item) => item?.checked);

  // Group unchecked items by category
  const groupedItems: Record<Category, InstanceOfSchema<typeof GroceryItem>[]> = {
    produce: [],
    dairy: [],
    meat: [],
    pantry: [],
    frozen: [],
    household: [],
    bakery: [],
    beverages: [],
    other: [],
  };

  uncheckedItems.forEach((item) => {
    if (item?.category) {
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
      groupedItems[item.category].push(item);
    }
  });

  const startEditingName = () => {
    setEditedName(list.name);
    setIsEditingName(true);
  };

  const saveListName = () => {
    if (editedName.trim() && editedName !== list.name) {
      list.$jazz.set('name', editedName.trim());
      list.$jazz.set('updatedAt', new Date());
    }
    setIsEditingName(false);
  };

  const cancelEditingName = () => {
    setEditedName('');
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveListName();
    } else if (e.key === 'Escape') {
      cancelEditingName();
    }
  };

  const handleDeleteItem = (itemId: string) => {
    const item = items.find((i) => i?.$jazz.id === itemId);
    if (item) {
      // Soft delete using Jazz's $jazz.set method
      item.$jazz.set('archived', true);
      item.$jazz.set('updatedAt', new Date());
      list.$jazz.set('updatedAt', new Date());
    }
  };

  const handleToggleCheck = (itemId: string) => {
    const item = items.find((i) => i?.$jazz.id === itemId);
    if (item) {
      const newCheckedState = !item.checked;
      item.$jazz.set('checked', newCheckedState);
      // Set checkedBy to account when checking, or explicitly set to null when unchecking
      if (newCheckedState) {
        item.$jazz.set('checkedBy', account);
      } else {
        item.$jazz.set('checkedBy', null);
      }
      item.$jazz.set('updatedAt', new Date());
      list.$jazz.set('updatedAt', new Date());
    }
  };

  const totalItems = activeItems.length;
  const checkedCount = checkedItems.length;
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="mb-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Lists
            </button>
          </div>

          <div className="mb-4">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-xl font-bold text-neutral-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
                <button
                  type="button"
                  onClick={saveListName}
                  className="rounded-lg bg-green-600 p-2 text-white hover:bg-green-700"
                  aria-label="Save"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={cancelEditingName}
                  className="rounded-lg bg-neutral-200 p-2 text-neutral-700 hover:bg-neutral-300"
                  aria-label="Cancel"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-neutral-900">{list.name}</h1>
                <button
                  type="button"
                  onClick={startEditingName}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  aria-label="Edit list name"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {totalItems > 0 && (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  {checkedCount} of {totalItems} completed
                </span>
                <span className="font-medium text-neutral-900">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full bg-green-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* Add Item Form */}
        <div className="mb-6">
          {/* @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists */}
          <AddItemForm list={list} account={account} />
        </div>

        {/* Items List */}
        <div className="space-y-8">
          {/* Unchecked Items by Category */}
          {Object.entries(groupedItems).map(([category, categoryItems]) => {
            if (categoryItems.length === 0) return null;
            const categoryInfo = CATEGORIES[category as Category];

            return (
              <div key={category}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                  <span className="text-lg">{categoryInfo.icon}</span>
                  <span>{categoryInfo.name}</span>
                  <span className="text-neutral-400">({categoryItems.length})</span>
                </h2>
                <div className="space-y-2">
                  {categoryItems.map((item) =>
                    item ? (
                      <ItemRow
                        key={item.$jazz.id}
                        item={item}
                        onToggleCheck={handleToggleCheck}
                        onDelete={handleDeleteItem}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}

          {/* Checked Items Section */}
          {checkedItems.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
                <span>✓</span>
                <span>Completed</span>
                <span className="text-neutral-400">({checkedItems.length})</span>
              </h2>
              <div className="space-y-2">
                {checkedItems.map((item) =>
                  item ? (
                    <ItemRow
                      key={item.$jazz.id}
                      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with nested CoLists
                      item={item}
                      onToggleCheck={handleToggleCheck}
                      onDelete={handleDeleteItem}
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {activeItems.length === 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
              <div className="text-5xl mb-4">📝</div>
              <h3 className="text-lg font-semibold text-neutral-900">No items yet</h3>
              <p className="mt-2 text-neutral-600">Add your first item to get started</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
