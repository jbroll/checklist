import { useCallback } from 'react';
import { useRowboat } from '@/rowboat';
import type { FolderRow } from '@/schema/folder';
import * as sessionService from '@/services/sessionService';

interface Args {
  renameNode: (id: string, name: string) => Promise<void>;
  archiveNode: (id: string) => Promise<void>;
  unarchiveNode: (id: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
}

export function useTreeActions({ renameNode, archiveNode, unarchiveNode, deleteNode }: Args) {
  const g = useRowboat();

  const handleToggleFolderExpand = useCallback(
    (folder: FolderRow) => {
      void g.folder.update(folder.id, { expanded: !folder.expanded });
    },
    [g],
  );

  const handleRenameFolder = useCallback(
    (folder: FolderRow, newName: string) => {
      void renameNode(folder.id, newName);
    },
    [renameNode],
  );

  const handleToggleArchiveFolder = useCallback(
    (folder: FolderRow) => {
      if (folder.archived) {
        void unarchiveNode(folder.id);
      } else {
        void archiveNode(folder.id);
      }
    },
    [archiveNode, unarchiveNode],
  );

  const handleDeleteFolder = useCallback(
    (folder: FolderRow) => {
      void deleteNode(folder.id);
    },
    [deleteNode],
  );

  const handleToggleArchiveSession = useCallback(
    (templateId: string, sessionId: string, archived: boolean) => {
      if (archived) {
        void sessionService.unarchiveSession(g, templateId, sessionId);
      } else {
        void sessionService.archiveSession(g, templateId, sessionId);
      }
    },
    [g],
  );

  const handleRenameSession = useCallback(
    (templateId: string, sessionId: string, name: string) => {
      void sessionService.renameSession(g, templateId, sessionId, name);
    },
    [g],
  );

  const handleDeleteSession = useCallback(
    (templateId: string, sessionId: string) => {
      void sessionService.deleteSession(g, templateId, sessionId);
    },
    [g],
  );

  return {
    handleToggleFolderExpand,
    handleRenameFolder,
    handleToggleArchiveFolder,
    handleDeleteFolder,
    handleToggleArchiveSession,
    handleRenameSession,
    handleDeleteSession,
  };
}
