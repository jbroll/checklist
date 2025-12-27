import type { InstanceOfSchema } from 'jazz-tools';
import type { ItemInputValue } from '@/components/ui/ItemInput';
import type { Account, SessionData, Template, TemplateItem } from '@/schemas';
import * as SessionService from '@/services/sessionService';
import * as templateService from '@/services/templateService';
import * as userSettingsService from '@/services/userSettingsService';
import * as viewStateService from '@/services/viewStateService';

interface UseSessionHandlersOptions {
  template: InstanceOfSchema<typeof Template>;
  session: SessionData | null;
  sessionId: string;
  me: InstanceOfSchema<typeof Account> | null;
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
  me,
  activeItems,
  checkedItems,
  captureScrollPosition,
  setSelectedItemId,
  onSwitchSession,
}: UseSessionHandlersOptions) {
  const items = template.items || [];

  const handleRenameItem = (itemId: string, newName: string) => {
    if (!me) return;
    templateService.renameItem(me, template.$jazz.id, itemId, newName);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!me) return;
    templateService.archiveItem(me, template.$jazz.id, itemId);
  };

  const handleToggleExpand = (itemId: string) => {
    const item = items.find((i) => i?.id === itemId);
    if (item && item.type === 'category' && me) {
      viewStateService.toggleTemplateCategoryExpanded(me, template.$jazz.id, itemId);
    }
  };

  const handleToggleSelected = (itemId: string) => {
    if (!me) return;
    captureScrollPosition();
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleChecked = (itemId: string) => {
    if (!me) return;
    captureScrollPosition();
    SessionService.toggleItemChecked(me, template.$jazz.id, sessionId, itemId);
  };

  const handleToggleCategoryExpanded = (catKey: string) => {
    if (!session || !me) return;
    viewStateService.toggleTemplateCategoryExpanded(me, template.$jazz.id, catKey);
  };

  const handleBatchSelectAll = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, true);
  };

  const handleBatchDeselectAll = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, false);
  };

  const handleBatchToggle = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    SessionService.invertItemSelection(me, template.$jazz.id, sessionId, itemIds);
  };

  // Default items handlers - update both defaults AND current session
  const handleToggleDefault = (itemId: string) => {
    if (!me) return;
    captureScrollPosition();
    // Toggle in defaultItems
    templateService.toggleItemDefault(me, template.$jazz.id, itemId);
    // Also toggle in current session to keep them in sync
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, itemId);
  };

  const handleBatchDefaultSelectAll = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    templateService.batchSetItemsDefault(me, template.$jazz.id, itemIds, true);
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, true);
  };

  const handleBatchDefaultDeselectAll = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    templateService.batchSetItemsDefault(me, template.$jazz.id, itemIds, false);
    SessionService.batchSelectItems(me, template.$jazz.id, sessionId, itemIds, false);
  };

  const handleBatchDefaultToggle = (itemIds: string[]) => {
    if (!me) return;
    captureScrollPosition();
    templateService.invertItemsDefault(me, template.$jazz.id, itemIds);
    SessionService.invertItemSelection(me, template.$jazz.id, sessionId, itemIds);
  };

  const handleClearOrNew = () => {
    if (!me) return;

    // Only create a new session if items have been checked off (purchased)
    // If session is still in default state (no checked items), do nothing
    if (checkedItems.length > 0) {
      const newSessionId = SessionService.createSession(me, template.$jazz.id);
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
  const addItemCore = (
    value: ItemInputValue,
    selectedItemId: string | null,
    syncToSession: boolean,
  ): string | undefined => {
    if (!me) return;

    const templateId = template.$jazz.id;

    // For categories, use insertion point logic
    if (value.type === 'category') {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        selectedItemId,
      );
      const newItemId = templateService.createCategory(
        me,
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
      me,
      template,
    );
    let finalParentPath: string | undefined;
    let finalSortOrder: number | undefined;

    if (value.categoryInfo && autoCategorizeEnabled) {
      const categoryName = value.categoryInfo.subcategoryName || value.categoryInfo.categoryName;
      const existingCategory = findCategoryByName(categoryName);

      if (existingCategory) {
        finalParentPath = existingCategory.path;
      } else {
        templateService.createCategory(me, templateId, categoryName, undefined);
        finalParentPath = categoryName;
      }
    } else {
      const insertion = templateService.calculateInsertionPoint(template, selectedItemId);
      finalParentPath = insertion.parentPath;
      finalSortOrder = insertion.sortOrder;
    }

    const newItemId = templateService.createItem(
      me,
      templateId,
      value.name,
      finalParentPath,
      value.defaultQuantity || '',
      finalSortOrder,
    );

    if (syncToSession) {
      SessionService.toggleItemSelected(me, templateId, sessionId, newItemId);
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
