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
  selectedItems: TemplateItem[];
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
  selectedItems,
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

    const hasCheckedItems = selectedItems.length > 0 || checkedItems.length > 0;

    if (hasCheckedItems) {
      const newSessionId = SessionService.createSession(me, template.$jazz.id);
      if (onSwitchSession) {
        onSwitchSession(newSessionId);
      }
    } else {
      SessionService.clearSessionState(me, template.$jazz.id, sessionId);
    }
  };

  const handleAddItem = (value: ItemInputValue) => {
    if (!me) return;

    // For categories, use standard insertion point logic
    if (value.type === 'category') {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        null, // selectedItemId passed separately
      );
      const newItemId = templateService.createCategory(
        me,
        template.$jazz.id,
        value.name,
        parentPath,
        sortOrder,
      );
      setSelectedItemId(newItemId);
      return newItemId;
    }

    // For items, check if auto-categorization is enabled
    const autoCategorizeEnabled = userSettingsService.getTemplateAutoCategorizeEnabled(
      me,
      template,
    );

    let finalParentPath: string | undefined;
    let finalSortOrder: number | undefined;

    // If categoryInfo provided and auto-categorization is enabled, place item in category
    if (value.categoryInfo && autoCategorizeEnabled) {
      const categoryName = value.categoryInfo.subcategoryName || value.categoryInfo.categoryName;

      const existingCategory = activeItems.find(
        (item) =>
          item.type === 'category' && item.name === categoryName && item.path === categoryName,
      );

      if (existingCategory) {
        finalParentPath = existingCategory.path;
      } else {
        templateService.createCategory(me, template.$jazz.id, categoryName, undefined);
        finalParentPath = categoryName;
      }
    } else {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(template, null);
      finalParentPath = parentPath;
      finalSortOrder = sortOrder;
    }

    const newItemId = templateService.createItem(
      me,
      template.$jazz.id,
      value.name,
      finalParentPath,
      value.defaultQuantity || '',
      finalSortOrder,
    );

    setSelectedItemId(newItemId);
    return newItemId;
  };

  // Wrapper that includes insertion point calculation
  const handleAddItemWithInsertionPoint = (
    value: ItemInputValue,
    selectedItemId: string | null,
  ) => {
    if (!me) return;

    if (value.type === 'category') {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        selectedItemId,
      );
      const newItemId = templateService.createCategory(
        me,
        template.$jazz.id,
        value.name,
        parentPath,
        sortOrder,
      );
      setSelectedItemId(newItemId);
      return;
    }

    const autoCategorizeEnabled = userSettingsService.getTemplateAutoCategorizeEnabled(
      me,
      template,
    );

    let finalParentPath: string | undefined;
    let finalSortOrder: number | undefined;

    if (value.categoryInfo && autoCategorizeEnabled) {
      const categoryName = value.categoryInfo.subcategoryName || value.categoryInfo.categoryName;

      const existingCategory = activeItems.find(
        (item) =>
          item.type === 'category' && item.name === categoryName && item.path === categoryName,
      );

      if (existingCategory) {
        finalParentPath = existingCategory.path;
      } else {
        templateService.createCategory(me, template.$jazz.id, categoryName, undefined);
        finalParentPath = categoryName;
      }
    } else {
      const { parentPath, sortOrder } = templateService.calculateInsertionPoint(
        template,
        selectedItemId,
      );
      finalParentPath = parentPath;
      finalSortOrder = sortOrder;
    }

    const newItemId = templateService.createItem(
      me,
      template.$jazz.id,
      value.name,
      finalParentPath,
      value.defaultQuantity || '',
      finalSortOrder,
    );

    // Also add the new item to the current session (since it's auto-added to defaults,
    // we need to sync the session state to match)
    SessionService.toggleItemSelected(me, template.$jazz.id, sessionId, newItemId);

    setSelectedItemId(newItemId);
  };

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
