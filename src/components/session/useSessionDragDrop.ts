import {
  type DragEndEvent,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { useState } from 'react';
import type { FolderRow, schema, TemplateItem } from '@/schema/folder';
import * as templateService from '@/services/templateService';
import { getParentPath } from '@/utils/pathUtils';
import { calculateMidpointSortOrder } from '@/utils/sortOrderHelpers';

type Graph = RelationalGraph<typeof schema>;

interface UseSessionDragDropOptions {
  template: FolderRow;
  g: Graph;
  activeItems: TemplateItem[];
}

/**
 * Hook to handle drag and drop functionality for reordering and moving items
 * in the session view.
 */
export function useSessionDragDrop({ template, g, activeItems }: UseSessionDragDropOptions) {
  const [activeItem, setActiveItem] = useState<TemplateItem | null>(null);

  // Configure sensors for drag detection
  // Use MouseSensor + TouchSensor instead of PointerSensor for proper mobile support
  // TouchSensor allows scrolling while supporting drag gestures
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms hold before drag starts (allows scrolling)
        tolerance: 8, // Allow 8px of movement during the delay
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const draggedItem = event.active.data.current?.item as TemplateItem;
    setActiveItem(draggedItem);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveItem(null);

    if (!over || !active.data.current) {
      return;
    }

    const draggedItem = active.data.current.item as TemplateItem;
    const overData = over.data.current;

    // Don't allow dropping on itself
    if (over.id === active.id) {
      return;
    }

    // Handle reorder zone drops
    if (overData?.type === 'reorder-zone') {
      const currentParentPath = getParentPath(draggedItem.path);
      const targetParentPath = overData.parentPath as string | undefined;

      // Prevent moving a category into itself or its descendants
      if (draggedItem.type === 'category') {
        if (targetParentPath?.startsWith(draggedItem.path)) {
          return;
        }
        if (targetParentPath === draggedItem.path) {
          return;
        }
      }

      // Get siblings at the target level
      const siblings = activeItems.filter((item) => getParentPath(item.path) === targetParentPath);
      siblings.sort((a, b) => a.sortOrder - b.sortOrder);

      const afterItemId = overData.afterItemId as string | undefined;
      const beforeItemId = overData.beforeItemId as string | undefined;

      // Find the sortOrder values to calculate midpoint
      let beforeSortOrder: number | undefined;
      let afterSortOrder: number | undefined;

      if (afterItemId) {
        const afterItem = siblings.find((item) => item.id === afterItemId);
        afterSortOrder = afterItem?.sortOrder;
      }

      if (beforeItemId) {
        const beforeItem = siblings.find((item) => item.id === beforeItemId);
        beforeSortOrder = beforeItem?.sortOrder;
      }

      // Calculate new sortOrder using fractional indexing
      const newSortOrder = calculateMidpointSortOrder(afterSortOrder, beforeSortOrder);

      // Check if moving to a different parent or just reordering
      if (targetParentPath !== currentParentPath) {
        // Move and reorder in a single operation
        try {
          templateService.moveItem(g, template.id, draggedItem.id, targetParentPath, newSortOrder);
        } catch {
          // Silently ignore errors (e.g., duplicate names)
        }
      } else {
        // Just reordering within the same parent
        try {
          templateService.reorderItem(g, template.id, draggedItem.id, newSortOrder);
        } catch {
          // Silently ignore errors
        }
      }
      return;
    }

    // Handle drops on categories (move item into category)
    if (overData?.isCategory) {
      const newParentPath = overData.path as string;
      const currentParentPath = getParentPath(draggedItem.path);

      // Don't move if already in this category
      if (newParentPath === currentParentPath) {
        return;
      }

      // Prevent moving a category into itself or its descendants
      if (draggedItem.type === 'category' && newParentPath?.startsWith(draggedItem.path)) {
        return;
      }

      // Insert at the start of the category
      const categoryItems = activeItems.filter(
        (item) => getParentPath(item.path) === newParentPath,
      );
      categoryItems.sort((a, b) => a.sortOrder - b.sortOrder);

      // Calculate sortOrder to insert before first item
      const firstItemSortOrder = categoryItems.length > 0 ? categoryItems[0].sortOrder : undefined;
      const newSortOrder = calculateMidpointSortOrder(undefined, firstItemSortOrder);

      try {
        templateService.moveItem(g, template.id, draggedItem.id, newParentPath, newSortOrder);
      } catch {
        // Silently ignore errors
      }
    }
  };

  const handleDragCancel = () => {
    setActiveItem(null);
  };

  return {
    sensors,
    activeItem,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
