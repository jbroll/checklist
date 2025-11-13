import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { AddFolderDialog } from '@/components/editor/AddFolderDialog';
import { ExportDialog } from '@/components/export/ExportDialog';
import { ImportDialog } from '@/components/import/ImportDialog';
import type { Account } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as templateService from '@/services/templateService';
import { SimplifiedSessionView } from './SimplifiedSessionView';
import { SimplifiedTemplateSelector } from './SimplifiedTemplateSelector';

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
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleAddFolder = (name: string, isTemplate: boolean) => {
    if (!account.root) return;

    // Create directory entry at root level (no parent path)
    // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
    directoryService.createDirectoryEntry(account as any, name, isTemplate, undefined);
  };

  // If a template is selected, show session view
  if (selectedTemplateId) {
    const template = templateService.getTemplate(account, selectedTemplateId);

    if (template) {
      return (
        <SimplifiedSessionView
          account={account}
          template={template}
          onBack={() => setSelectedTemplateId(null)}
        />
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with Account root type
  const accountAsAny = account as any;

  // Otherwise show template selector
  return (
    <>
      <SimplifiedTemplateSelector
        account={account}
        onSelectTemplate={setSelectedTemplateId}
        onViewModeChange={onViewModeChange}
        onAddFolder={() => setShowAddFolder(true)}
        onAddTemplate={() => setShowAddTemplate(true)}
        onExport={() => setShowExportDialog(true)}
        onImport={() => setShowImportDialog(true)}
        onSignOut={onSignOut}
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
        parentPath={undefined}
      />
    </>
  );
}
