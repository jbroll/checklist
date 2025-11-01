import { List, LogOut, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { co } from 'jazz-tools';
import { useCoState } from '@/lib/jazz';
import { GroceryList, GroceryItem, ListsRoot } from '@/schemas';
import { ListView } from './ListView';

interface ListsViewProps {
  account: any;
  onSignOut: () => void;
}

export function ListsView({ account, onSignOut }: ListsViewProps) {
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const root = useCoState(ListsRoot, account.root?.id);

  // If a list is selected, show the ListView
  if (selectedListId) {
    return (
      <ListView listId={selectedListId} account={account} onBack={() => setSelectedListId(null)} />
    );
  }

  // Get all lists (both owned and shared)
  const myLists = root?.myLists || [];
  const sharedLists = root?.sharedLists || [];
  const allLists = [...myLists, ...sharedLists].filter((list) => list && !list.archived);

  const handleCreateList = () => {
    console.log('handleCreateList called', { root, account });

    if (!root) {
      console.error('Root is null, cannot create list');
      return;
    }

    try {
      // Generate a unique name like "New List 1", "New List 2", etc.
      const existingNumbers = allLists
        .map((list: any) => {
          const match = list?.name?.match(/^New List (\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n: number) => n > 0);

      const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
      const listName = `New List ${nextNumber}`;

      console.log('Creating list with name:', listName);

      // Create new list with properly initialized items CoList
      const newList = GroceryList.create(
        {
          name: listName,
          items: co.list(GroceryItem).create([]),
          owner: account,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { owner: account }
      );

      console.log('New list created:', newList);

      // Add to user's lists using Jazz's push method
      if (root.myLists) {
        root.myLists.$jazz.push(newList);
        console.log('List added to root.myLists');
      } else {
        console.error('root.myLists is null');
      }
    } catch (error) {
      console.error('Error creating list:', error);
    }
  };

  const handleDeleteList = (listId: string, listName: string) => {
    if (window.confirm(`Are you sure you want to delete "${listName}"?`)) {
      const list = myLists.find((l: any) => l?.id === listId);
      if (list) {
        // Soft delete by setting archived flag
        (list as any).archived = true;
        (list as any).updatedAt = new Date();
      }
    }
  };

  const getItemCount = (list: any): number => {
    if (!list || !list.items) return 0;
    return list.items.filter((item: any) => item && !item.archived).length;
  };

  const formatDate = (date: Date | undefined): string => {
    if (!date) return 'Unknown';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🛒</div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">GroceryList</h1>
                <p className="text-sm text-neutral-600">{account.profile?.name || 'User'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Create New List Button */}
        <button
          type="button"
          onClick={handleCreateList}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 bg-white px-4 py-6 text-neutral-600 hover:border-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">Create New List</span>
        </button>

        {/* Lists Grid */}
        {allLists.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
            <List className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-4 text-lg font-semibold text-neutral-900">No lists yet</h3>
            <p className="mt-2 text-neutral-600">Create your first grocery list to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allLists.map((list) => {
              if (!list) return null;
              const itemCount = getItemCount(list);
              const isOwned = myLists.some((l: any) => l?.id === (list as any).id);

              return (
                <div
                  key={(list as any).id}
                  className="group relative rounded-lg border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedListId((list as any).id)}
                    className="w-full text-left"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-semibold text-neutral-900 line-clamp-2">{list.name}</h3>
                      {!isOwned && (
                        <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Shared
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-neutral-600">
                      <div>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Updated {formatDate(list.updatedAt)}
                      </div>
                    </div>
                  </button>

                  {isOwned && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList((list as any).id, list.name);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-opacity"
                      aria-label="Delete list"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
