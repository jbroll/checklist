import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, FolderNode, TemplateItem } from '../schemas';
import type { SessionData } from '../schemas/tree';
import { batchSelectItems, invertItemSelection, toggleSelectAllItems } from './sessionService';

// Mock Jazz CoValues
const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  return {
    root: {
      folders: [],
    },
  } as any;
};

// Sessions are now plain JavaScript objects (SessionData), not CoValues
const createMockSession = (): SessionData => {
  return {
    id: 'session-1',
    itemStates: {},
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };
};

const createMockTemplate = (session: SessionData): InstanceOfSchema<typeof FolderNode> => {
  const item1 = {
    id: 'item-1',
    name: 'Item 1',
    type: 'item',
    path: 'category1/item-1',
    sortOrder: 0,
    archived: false,
  } as InstanceOfSchema<typeof TemplateItem>;

  const item2 = {
    id: 'item-2',
    name: 'Item 2',
    type: 'item',
    path: 'category1/item-2',
    sortOrder: 1,
    archived: false,
  } as InstanceOfSchema<typeof TemplateItem>;

  const item3 = {
    id: 'item-3',
    name: 'Item 3',
    type: 'item',
    path: 'category2/item-3',
    sortOrder: 0,
    archived: false,
  } as InstanceOfSchema<typeof TemplateItem>;

  const template: any = {
    name: 'Test Template',
    items: [item1, item2, item3],
    sessions: [session],
    showZoneHeadings: false,
    archived: false,
    expanded: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  template.$jazz = {
    id: 'template-1',
    set: (key: string, value: any) => {
      template[key] = value;
    },
  };

  return template as InstanceOfSchema<typeof FolderNode>;
};

describe('Batch Selection Functions', () => {
  let account: InstanceOfSchema<typeof Account>;
  let session: SessionData;
  let template: InstanceOfSchema<typeof FolderNode>;

  beforeEach(() => {
    account = createMockAccount();
    session = createMockSession();
    template = createMockTemplate(session);
    account.root.folders = [template];
  });

  describe('batchSelectItems', () => {
    it('should select multiple items when selected=true', () => {
      const itemIds = ['item-1', 'item-2'];

      batchSelectItems(account, 'template-1', 'session-1', itemIds, true);

      expect(template.sessions[0].itemStates['item-1']).toBeDefined();
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-1'].checked).toBe(false);

      expect(template.sessions[0].itemStates['item-2']).toBeDefined();
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-2'].checked).toBe(false);
    });

    it('should deselect multiple items when selected=false', () => {
      // First select items
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
        'item-2': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2'];

      batchSelectItems(account, 'template-1', 'session-1', itemIds, false);

      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should not affect items not in the batch', () => {
      // Select item-3
      template.sessions[0].itemStates = {
        'item-3': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2'];

      batchSelectItems(account, 'template-1', 'session-1', itemIds, true);

      // item-3 should remain selected
      expect(template.sessions[0].itemStates['item-3'].selected).toBe(true);
      // item-1 and item-2 should be selected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
    });
  });

  describe('toggleSelectAllItems', () => {
    it('should select all when none are selected', () => {
      const itemIds = ['item-1', 'item-2'];

      toggleSelectAllItems(account, 'template-1', 'session-1', itemIds);

      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should select all when some are selected', () => {
      // Select only item-1
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2'];

      toggleSelectAllItems(account, 'template-1', 'session-1', itemIds);

      // Both should be selected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should deselect all when all are selected', () => {
      // Select both items
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
        'item-2': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2'];

      toggleSelectAllItems(account, 'template-1', 'session-1', itemIds);

      // Both should be deselected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should handle empty item list', () => {
      const itemIds: string[] = [];

      // Should not throw
      expect(() => {
        toggleSelectAllItems(account, 'template-1', 'session-1', itemIds);
      }).not.toThrow();
    });
  });

  describe('invertItemSelection', () => {
    it('should invert selection for unselected items', () => {
      const itemIds = ['item-1', 'item-2'];

      invertItemSelection(account, 'template-1', 'session-1', itemIds);

      // Both should now be selected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should invert selection for selected items', () => {
      // Select both items
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
        'item-2': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2'];

      invertItemSelection(account, 'template-1', 'session-1', itemIds);

      // Both should now be deselected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should invert mixed selection states', () => {
      // Select only item-1
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2', 'item-3'];

      invertItemSelection(account, 'template-1', 'session-1', itemIds);

      // item-1 should be deselected, item-2 and item-3 should be selected
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-3'].selected).toBe(true);
    });

    it('should preserve checked state when inverting from selected to unselected', () => {
      // Select and check item-1
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: true, selectedAt: new Date(), checkedAt: new Date() },
      };

      const itemIds = ['item-1'];

      invertItemSelection(account, 'template-1', 'session-1', itemIds);

      // item-1 should be deselected, and checked should be cleared
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-1'].checked).toBe(false);
    });

    it('should handle empty item list', () => {
      const itemIds: string[] = [];

      // Should not throw
      expect(() => {
        invertItemSelection(account, 'template-1', 'session-1', itemIds);
      }).not.toThrow();
    });

    it('should invert each item individually in mixed state', () => {
      // Complex scenario: some selected, some not
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
        'item-2': { selected: false, checked: false, selectedAt: new Date() },
        'item-3': { selected: true, checked: false, selectedAt: new Date() },
      };

      const itemIds = ['item-1', 'item-2', 'item-3'];

      invertItemSelection(account, 'template-1', 'session-1', itemIds);

      // Each should be inverted
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2'].selected).toBe(true);
      expect(template.sessions[0].itemStates['item-3'].selected).toBe(false);
    });
  });
});
