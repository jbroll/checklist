import type { FolderRow } from '@/schema/folder';

export interface TreeNode {
  folder: FolderRow;
  children: TreeNode[];
  level: number;
}

export interface TreeViewSelectionHandlers {
  onFolderSelect?: (folderId: string) => void;
  onTemplateSelect?: (templateId: string) => void;
  onOpenSession?: (templateId: string, sessionId: string) => void;
  onExportSession?: (templateId: string, sessionId: string) => void;
}

export interface TreeViewHeaderActions {
  onHeaderClick?: () => void;
  onAddFolder?: () => void;
  onAddTemplate?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export interface TreeViewAuthProps {
  onSignOut?: () => void;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;
  isAuthenticated?: boolean;
  showProfileDialog?: boolean;
  onShowProfileDialogChange?: (show: boolean) => void;
}

export interface TreeViewArchiveSettings {
  hideArchivedTemplatesToggle?: boolean;
  hideArchivedSessionsToggle?: boolean;
  hideArchiveAction?: boolean;
}

export interface TreeViewSubscriptionInfo {
  subscriptionTier?: string;
  listCount?: number;
  maxLists?: number;
  onUpgradeClick?: () => void;
}
