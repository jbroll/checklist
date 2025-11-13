import type { InstanceOfSchema } from 'jazz-tools';
import { useMemo, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { AddFolderDialog } from '@/components/editor/AddFolderDialog';
import { ExportDialog } from '@/components/export/ExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import { SessionView } from '@/components/session/SessionView';
import { TreeView } from '@/components/tree/TreeView';
import type { Account } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as simplifiedSessionService from '@/services/simplified/simplifiedSessionService';
import * as templateService from '@/services/templateService';
import { PATH_SEPARATOR } from '@/utils/pathUtils';

interface SimplifiedAppProps {
  account: InstanceOfSchema<typeof Account>;
  onViewModeChange: (mode: ViewMode) => void;
  onSignOut?: () => void;
}

/**
 * Top-level container for the simplified UI mode
 * This is a completely separate component tree from the classic Dashboard/TreeView
 * Manages navigation between template selection and session view
 */
export function SimplifiedApp({ account, onViewModeChange, onSignOut }: SimplifiedAppProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Compute parent path for import based on selected folder
  const importParentPath = useMemo(() => {
    if (!selectedEntryId) return undefined;

    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
    const entries = directoryService.getAllDirectoryEntries(account as any);
    const selectedEntry = entries.find((e) => e.id === selectedEntryId);

    // Only use folder paths (not template-refs)
    if (selectedEntry?.type === 'folder') {
      return selectedEntry.path;
    }

    return undefined;
  }, [selectedEntryId, account]);

  // No useEffect needed - session is created directly in handleTemplateSelect

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!account.root) return;

    // Determine parent path based on selected entry
    let parentPath: string | undefined;
    if (selectedEntryId) {
      // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
      const entries = directoryService.getAllDirectoryEntries(account as any);
      const selectedEntry = entries.find((e) => e.id === selectedEntryId);
      if (selectedEntry) {
        if (selectedEntry.type === 'folder') {
          // If selected entry is a folder, create inside it
          parentPath = selectedEntry.path;
        } else {
          // If selected entry is a template-ref, create at the same level (sibling)
          const pathParts = selectedEntry.path.split(PATH_SEPARATOR);
          parentPath = pathParts.slice(0, -1).join(PATH_SEPARATOR) || undefined;
        }
      }
    }

    // Create directory entry (folder or template-ref)
    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
    directoryService.createDirectoryEntry(account as any, name, isTemplate, parentPath);
  };

  // If a template is selected, show session view
  if (selectedTemplateId && currentSessionId) {
    const template = templateService.getTemplate(account, selectedTemplateId);

    if (template) {
      return (
        <SessionView
          template={template}
          sessionId={currentSessionId}
          onBack={() => {
            setSelectedTemplateId(null);
            setSelectedEntryId(null);
            setCurrentSessionId(null);
          }}
          simplifiedUI={true}
        />
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
  const accountAsAny = account as any;

  const handleTemplateSelect = (templateId: string) => {
    const template = templateService.getTemplate(account, templateId);
    if (template) {
      // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
      const sessionId = simplifiedSessionService.getOrCreateCurrentSession(
        account as any,
        template,
      );
      // Set all state together to avoid intermediate renders
      setSelectedTemplateId(templateId);
      setCurrentSessionId(sessionId);
    }
  };

  const handleEntrySelect = (entryId: string) => {
    // Don't set selectedEntryId when navigating to a template in simplified mode
    // This prevents the Edit/Use buttons from appearing before SessionView renders
    const entries = directoryService.getAllDirectoryEntries(account as any);
    const entry = entries.find((e) => e.id === entryId);

    // Only set selectedEntryId for folders (not template-refs)
    if (entry?.type === 'folder') {
      setSelectedEntryId(entryId);
    }
  };

  const handleHeaderClick = () => {
    // Clicking on BubbleList header deselects everything
    setSelectedTemplateId(null);
    setSelectedEntryId(null);
  };

  const handleUseTemplate = () => {
    if (!selectedTemplateId) return;
    // Navigation to SimplifiedSessionView happens automatically when selectedTemplateId is set
    // Template is already selected, so this just confirms the action
  };

  const handleEditTemplate = () => {
    if (!selectedTemplateId) return;
    // For simplified view, we also just navigate to session view (no separate edit mode)
    // Could be enhanced later to show a different view
  };

  // Otherwise show template selector using TreeView with sessionsEnabled=false
  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <TreeView
          account={accountAsAny}
          selectedTemplateId={selectedTemplateId}
          selectedEntryId={selectedEntryId}
          onTemplateSelect={handleTemplateSelect}
          onEntrySelect={handleEntrySelect}
          onUseTemplate={handleUseTemplate}
          onEditTemplate={handleEditTemplate}
          onHeaderClick={handleHeaderClick}
          onAddFolder={() => setShowAddFolder(true)}
          onAddTemplate={() => setShowAddTemplate(true)}
          onExport={() => setShowExportDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onSignOut={onSignOut}
          onSwitchToSimplified={() => onViewModeChange('classic')}
          switchViewLabel="Classic View"
          sessionsEnabled={false}
          hideArchivedToggle={true}
        />

        <AddFolderDialog
          open={showAddFolder}
          onOpenChange={setShowAddFolder}
          onAdd={handleAddFolder}
        />

        <AddFolderDialog
          open={showAddTemplate}
          onOpenChange={setShowAddTemplate}
          onAdd={handleAddFolder}
          defaultIsTemplate={true}
          title="New List"
          description="Create a new list folder for frequently purchased items."
        />

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          account={accountAsAny}
        />

        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          account={accountAsAny}
          parentPath={importParentPath}
        />
      </main>
    </div>
  );
}
