import { useCallback, useState } from 'react';

/**
 * Return type for useTemplateNavigation hook
 */
export interface UseTemplateNavigationReturn {
  /** Currently selected template ID (for highlighting in tree view) */
  selectedTemplateId: string | null;
  /** Currently selected folder ID (organizational or template folder) */
  selectedFolderId: string | null;
  /** Select a template by ID */
  selectTemplate: (templateId: string) => void;
  /** Select a folder by ID */
  selectFolder: (folderId: string) => void;
  /** Clear all selections */
  clearSelection: () => void;
}

/**
 * Hook to manage template and folder selection state.
 *
 * This hook manages the selection state for the tree view, tracking
 * which template or folder is currently selected for highlighting
 * and contextual actions.
 *
 * Note: This hook manages UI selection state only. Navigation to
 * session views is handled separately by useNavigationHistory.
 *
 * @example
 * ```tsx
 * const {
 *   selectedTemplateId,
 *   selectedFolderId,
 *   selectTemplate,
 *   selectFolder,
 *   clearSelection,
 * } = useTemplateNavigation();
 *
 * // Handle template click
 * const handleTemplateClick = (templateId: string) => {
 *   selectTemplate(templateId);
 *   // Navigate to session...
 * };
 *
 * // Handle header click to deselect
 * const handleHeaderClick = () => {
 *   clearSelection();
 * };
 * ```
 */
export function useTemplateNavigation(): UseTemplateNavigationReturn {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const selectTemplate = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
  }, []);

  const selectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTemplateId(null);
    setSelectedFolderId(null);
  }, []);

  return {
    selectedTemplateId,
    selectedFolderId,
    selectTemplate,
    selectFolder,
    clearSelection,
  };
}
