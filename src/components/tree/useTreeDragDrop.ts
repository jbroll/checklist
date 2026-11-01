import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useCallback, useState } from 'react';
import type { FolderRow } from '@/schema/folder';

interface Args {
  findById: (id: string) => FolderRow | undefined;
  moveNode: (id: string, newParentId: string | null) => Promise<void>;
}

export function useTreeDragDrop({ findById, moveNode }: Args) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const folderId = event.active.data.current?.folderId as string;
    setActiveFolderId(folderId);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // No-op: reserved for future visual feedback during drag.
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveFolderId(null);
      if (!over || !active.data.current) return;

      const draggedFolderId = active.data.current.folderId as string;
      const overData = over.data.current;
      const draggedFolder = findById(draggedFolderId);
      if (!draggedFolder) return;

      let newParentId: string | null | undefined;
      if (overData?.path === '__ROOT_DROP_ZONE__') {
        newParentId = null;
      } else if (overData?.isFolder && overData?.folderId) {
        newParentId = overData.folderId as string;
      }

      if (newParentId === undefined) return;

      try {
        void moveNode(draggedFolder.id, newParentId);
      } catch (error) {
        console.error('[TreeView] Error moving folder:', error);
      }
    },
    [findById, moveNode],
  );

  const handleDragCancel = useCallback(() => {
    setActiveFolderId(null);
  }, []);

  return {
    activeFolderId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
