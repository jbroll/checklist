import { ReorderDropZone } from '@/components/tree/ReorderDropZone';
import { TemplateItemView } from '@/components/tree/TemplateItemView';
import type { FolderRow, SessionData, TemplateItem } from '@/schema/folder';
import type { ItemTreeNode as UtilItemTreeNode } from '@/utils/itemTreeHelpers';
import { getParentPath } from '@/utils/pathUtils';
import { SessionZone } from './SessionZone';

export type ItemTreeNode = UtilItemTreeNode<TemplateItem>;

interface ItemNodeRendererProps {
  node: ItemTreeNode;
  depth?: number;
  siblings?: ItemTreeNode[];
  index?: number;
  showAddForm: boolean;
  selectedItemId: string | null;
  currentItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  setCurrentItemId: (id: string | null) => void;
  session: SessionData;
  template: FolderRow;
  activeItems: TemplateItem[];
  activeItem: TemplateItem | null;
  isCategoryExpanded: (itemId: string) => boolean;
  onRenameItem: (itemId: string, newName: string) => void;
  onDeleteItem: (itemId: string) => void;
  onToggleExpand: (itemId: string) => void;
  onToggleSelected: (itemId: string) => void;
  onToggleChecked: (itemId: string) => void;
  onBatchSelectAll: (itemIds: string[]) => void;
  onBatchDeselectAll: (itemIds: string[]) => void;
  onBatchToggle: (itemIds: string[]) => void;
  onEditNote: (itemId: string) => void;
}

/**
 * Helper to collect all item IDs from a category tree (for batch operations)
 */
function collectCategoryItemIds(node: ItemTreeNode): string[] {
  const ids: string[] = [];

  const collect = (n: ItemTreeNode) => {
    if (n.item.type === 'item') {
      ids.push(n.item.id);
    }
    n.children.forEach(collect);
  };

  collect(node);
  return ids;
}

/**
 * Recursive component for rendering item tree nodes.
 * Handles both categories (with SessionZone in normal mode) and items.
 */
export function ItemNodeRenderer({
  node,
  depth = 0,
  siblings = [],
  index = 0,
  showAddForm,
  selectedItemId,
  currentItemId,
  setSelectedItemId,
  setCurrentItemId,
  session,
  template,
  activeItems,
  activeItem,
  isCategoryExpanded,
  onRenameItem,
  onDeleteItem,
  onToggleExpand,
  onToggleSelected,
  onToggleChecked,
  onBatchSelectAll,
  onBatchDeselectAll,
  onBatchToggle,
  onEditNote,
}: ItemNodeRendererProps) {
  const { item, children } = node;
  const parentPath = getParentPath(item.path);

  // For categories in normal mode (not edit mode), use SessionZone to get batch operation icons
  if (item.type === 'category' && !showAddForm) {
    const categoryItemIds = collectCategoryItemIds(node);

    // Get all items for this category (needed for SessionZone to calculate selection state)
    const categoryItems = activeItems.filter((i) => categoryItemIds.includes(i.id));

    return (
      <div key={item.id}>
        <SessionZone
          items={categoryItems}
          itemStates={session.itemStates}
          expanded={isCategoryExpanded(item.id)}
          onToggleExpand={() => onToggleExpand(item.id)}
          template={template}
          zoneConfig={{
            title: item.name,
            zone: 'available',
            count: categoryItemIds.length,
          }}
          itemActions={{
            onToggleSelected,
            onToggleChecked,
          }}
          batchActions={{
            onBatchSelectAll,
            onBatchDeselectAll,
            onBatchToggle,
          }}
          categorySelection={{
            categoryItem: item,
          }}
          itemEditModeProps={{
            onEditNote,
          }}
        >
          <div className="pl-4">
            {children.map((child, childIndex) => (
              <ItemNodeRenderer
                key={child.item.id}
                node={child}
                depth={depth + 1}
                siblings={children}
                index={childIndex}
                showAddForm={showAddForm}
                selectedItemId={selectedItemId}
                currentItemId={currentItemId}
                setSelectedItemId={setSelectedItemId}
                setCurrentItemId={setCurrentItemId}
                session={session}
                template={template}
                activeItems={activeItems}
                activeItem={activeItem}
                isCategoryExpanded={isCategoryExpanded}
                onRenameItem={onRenameItem}
                onDeleteItem={onDeleteItem}
                onToggleExpand={onToggleExpand}
                onToggleSelected={onToggleSelected}
                onToggleChecked={onToggleChecked}
                onBatchSelectAll={onBatchSelectAll}
                onBatchDeselectAll={onBatchDeselectAll}
                onBatchToggle={onBatchToggle}
                onEditNote={onEditNote}
              />
            ))}
          </div>
        </SessionZone>
      </div>
    );
  }

  // For items or categories in edit mode, use TemplateItemView
  return (
    <div key={item.id}>
      {/* Reorder zone before first sibling */}
      {index === 0 && (
        <ReorderDropZone
          id={`reorder-before-${item.id}`}
          beforeItemId={item.id}
          parentPath={parentPath}
          isDragging={!!activeItem}
        />
      )}
      <TemplateItemView
        item={item}
        level={depth}
        hasChildren={children.length > 0}
        isSelected={
          showAddForm
            ? selectedItemId === item.id // Insertion point highlight in ADDING mode
            : currentItemId === item.id // Current item highlight in NORMAL mode
        }
        isChecked={session.itemStates[item.id]?.selected ?? false}
        expanded={item.type === 'category' ? isCategoryExpanded(item.id) : undefined}
        onSelect={
          showAddForm
            ? () => {
                setSelectedItemId(selectedItemId === item.id ? null : item.id);
              }
            : (itemId: string) => {
                setCurrentItemId(currentItemId === itemId ? null : itemId);
              }
        }
        onCheckboxToggle={onToggleSelected}
        onRename={onRenameItem}
        onDelete={onDeleteItem}
        onToggleExpand={onToggleExpand}
        showDeleteIcon={showAddForm}
        enableDrag={showAddForm}
        enableEdit={showAddForm}
        showCheckbox={item.type === 'item'}
        onEditNote={onEditNote}
      />
      {/* Reorder zone after each sibling */}
      <ReorderDropZone
        id={`reorder-after-${item.id}`}
        afterItemId={item.id}
        beforeItemId={siblings[index + 1]?.item.id}
        parentPath={parentPath}
        isDragging={!!activeItem}
      />
      {/* Render children if category is expanded */}
      {item.type === 'category' && isCategoryExpanded(item.id) && children.length > 0 && (
        <div>
          {children.map((child, childIndex) => (
            <ItemNodeRenderer
              key={child.item.id}
              node={child}
              depth={depth + 1}
              siblings={children}
              index={childIndex}
              showAddForm={showAddForm}
              selectedItemId={selectedItemId}
              currentItemId={currentItemId}
              setSelectedItemId={setSelectedItemId}
              setCurrentItemId={setCurrentItemId}
              session={session}
              template={template}
              activeItems={activeItems}
              activeItem={activeItem}
              isCategoryExpanded={isCategoryExpanded}
              onRenameItem={onRenameItem}
              onDeleteItem={onDeleteItem}
              onToggleExpand={onToggleExpand}
              onToggleSelected={onToggleSelected}
              onToggleChecked={onToggleChecked}
              onBatchSelectAll={onBatchSelectAll}
              onBatchDeselectAll={onBatchDeselectAll}
              onBatchToggle={onBatchToggle}
              onEditNote={onEditNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}
