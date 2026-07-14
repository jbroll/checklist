import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { ItemInputValue } from '@/components/ui/ItemInput';
import type { FolderRow, SessionData, schema, TemplateItem } from '@/schema/folder';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';

type Graph = RelationalGraph<typeof schema>;

interface UseSessionHandlersOptions {
  template: FolderRow;
  session: SessionData | null;
  sessionId: string;
  g: Graph;
  activeItems: TemplateItem[];
  checkedItems: TemplateItem[];
  captureScrollPosition: () => void;
  setSelectedItemId: (id: string | null) => void;
  onSwitchSession?: (newSessionId: string) => void;
}

/**
 * Hook containing all session-related event handlers.
 * Manages item toggling, batch operations, and template modifications.
 */
export function useSessionHandlers({
  template,
  session,
  sessionId,
  g,
  activeItems,
  checkedItems,
  captureScrollPosition,
  setSelectedItemId,
  onSwitchSession,
}: UseSessionHandlersOptions) {
  const templateId = template.id;
  const items = template.items;

  const handleRenameItem = (itemId: string, newName: string) => {
    templateService.renameItem(g, templateId, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    templateService.archiveItem(g, templateId, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item && item.type === 'category') {
      viewStateService.toggleTemplateCategoryExpanded(g, templateId, itemId);
    }
  };

  const handleToggleSelected = (itemId: string) => {
    captureScrollPosition();
    SessionService.toggleItemSelected(g, templateId, sessionId, itemId);
  };

  const handleToggleChecked = (itemId: string) => {
    captureScrollPosition();
    SessionService.toggleItemChecked(g, templateId, sessionId, itemId);
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (!session) return;
    viewStateService.toggleTemplateCategoryExpanded(g, templateId, catKey);
  };

  const handleBatchSelectAll = (itemIds: string[]) => {
    captureScrollPosition();
    SessionService.batchSelectItems(g, templateId, sessionId, itemIds, true);
  };

  const handleBatchDeselectAll = (itemIds: string[]) => {
    captureScrollPosition();
    SessionService.batchSelectItems(g, templateId, sessionId, itemIds, false);
  };

  const handleBatchToggle = (itemIds: string[]) => {
    captureScrollPosition();
    SessionService.invertItemSelection(g, templateId, sessionId, itemIds);
  };

  // Default items handlers - update both defaults AND current session
  const handleToggleDefault = (itemId: string) => {
    captureScrollPosition();
    // Toggle in defaultItems
    templateService.toggleItemDefault(g, templateId, itemId);
    // Also toggle in current session to keep them in sync
    SessionService.toggleItemSelected(g, templateId, sessionId, itemId);
  };

  const handleBatchDefaultSelectAll = (itemIds: string[]) => {
    captureScrollPosition();
    templateService.batchSetItemsDefault(g, templateId, itemIds, true);
    SessionService.batchSelectItems(g, templateId, sessionId, itemIds, true);
  };

  const handleBatchDefaultDeselectAll = (itemIds: string[]) => {
    captureScrollPosition();
    templateService.batchSetItemsDefault(g, templateId, itemIds, false);
    SessionService.batchSelectItems(g, templateId, sessionId, itemIds, false);
  };

  const handleBatchDefaultToggle = (itemIds: string[]) => {
    captureScrollPosition();
    templateService.invertItemsDefault(g, templateId, itemIds);
    SessionService.invertItemSelection(g, templateId, sessionId, itemIds);
  };

  const handleClearOrNew = async () => {
    // Only create a new session if items have been checked off (purchased)
    // If session is still in default state (no checked items), do nothing
    if (checkedItems.length > 0) {
      const newSessionId = await SessionService.createSession(g, templateId);
      if (onSwitchSession) {
        onSwitchSession(newSessionId);
      }
    }
  };

  // Find existing category by name at root level
  const findCategoryByName = (categoryName: string): TemplateItem | undefined => {
    return activeItems.find(
      (item) =>
        item.type === 'category' && item.name === categoryName && item.path === categoryName,
    );
  };

  // Core add-item logic shared by both handlers
  const addItemCore = async (
    value: ItemInputValue,
    selectedItemId: string | null,
    syncToSession: boolean,
  ): Promise<string | undefined> => {
    // For categories, use insertion point logic
    if (value.type === 'category') {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        g,
        templateId,
        selectedItemId,
      );
      const newItemId = await templateService.createCategory(
        g,
        templateId,
        value.name,
        parentPath,
        sortOrder,
      );
      setSelectedItemId(newItemId);
      return newItemId;
    }

    // For items, determine parent path based on auto-categorization
    const autoCategorizeEnabled = userSettingsService.getTemplateAutoCategorizeEnabled(
      g,
      templateId,
    );
    let finalParentPath: string | undefined;
    let finalSortOrder: number | undefined;

    if (value.categoryInfo && autoCategorizeEnabled) {
      const categoryName = value.categoryInfo.subcategoryName || value.categoryInfo.categoryName;
      const existingCategory = findCategoryByName(categoryName);

      if (existingCategory) {
        finalParentPath = existingCategory.path;
      } else {
        await templateService.createCategory(g, templateId, categoryName, undefined);
        finalParentPath = categoryName;
      }
    } else {
      const insertion = templateService.calculateInsertionPoint(g, templateId, selectedItemId);
      finalParentPath = insertion.parentPath;
      finalSortOrder = insertion.sortOrder;
    }

    const newItemId = await templateService.createItem(
      g,
      templateId,
      value.name,
      finalParentPath,
      value.defaultQuantity || '',
      finalSortOrder,
    );

    if (syncToSession) {
      await SessionService.toggleItemSelected(g, templateId, sessionId, newItemId);
    }

    setSelectedItemId(newItemId);
    return newItemId;
  };

  const handleAddItem = (value: ItemInputValue) => addItemCore(value, null, false);

  const handleAddItemWithInsertionPoint = (value: ItemInputValue, selectedItemId: string | null) =>
    addItemCore(value, selectedItemId, true);

  return {
    handleRenameItem,
    handleDeleteItem,
    handleToggleExpand,
    handleToggleSelected,
    handleToggleChecked,
    handleToggleCategoryExpanded,
    handleBatchSelectAll,
    handleBatchDeselectAll,
    handleBatchToggle,
    handleToggleDefault,
    handleBatchDefaultSelectAll,
    handleBatchDefaultDeselectAll,
    handleBatchDefaultToggle,
    handleClearOrNew,
    handleAddItem,
    handleAddItemWithInsertionPoint,
  };
}
