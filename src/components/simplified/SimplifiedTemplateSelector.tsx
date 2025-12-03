import type { InstanceOfSchema } from 'jazz-tools';
import { ShoppingCart } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import { TreeViewHeader } from '@/components/tree/TreeViewHeader';
import { InstallInstructionsDialog } from '@/components/ui/InstallInstructionsDialog';
import { usePWAInstall } from '@/lib/usePWAInstall';
import type { Account } from '@/schemas';
import * as folderService from '@/services/folderService';

interface SimplifiedTemplateSelectorProps {
  account: InstanceOfSchema<typeof Account>;
  onSelectTemplate: (templateId: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onAddFolder: () => void;
  onAddTemplate: () => void;
  onExport: () => void;
  onImport: () => void;
  onSignOut?: () => void;
}

/**
 * SimplifiedTemplateSelector - Shows list of templates for user to choose from
 * Simple list view (no complex tree navigation)
 */
export function SimplifiedTemplateSelector({
  account,
  onSelectTemplate,
  onViewModeChange,
  onAddFolder,
  onAddTemplate,
  onExport,
  onImport,
  onSignOut,
}: SimplifiedTemplateSelectorProps) {
  // PWA install state
  const { showInstallOption, hasNativePrompt, triggerInstall } = usePWAInstall();
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  const handleInstallApp = useCallback(() => {
    if (hasNativePrompt) {
      triggerInstall();
    } else {
      setShowInstallDialog(true);
    }
  }, [hasNativePrompt, triggerInstall]);

  // Get all template folders (recursively from hierarchy)
  const templates = folderService.getAllTemplateFolders(account, false);

  // Generate display path for each template
  const templatesWithPath = templates.map((template) => ({
    template,
    path: folderService.getFolderDisplayPath(template),
  }));

  return (
    <div className="min-h-screen bg-surface-secondary p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-divider-primary bg-surface-elevated">
          {/* Header matching TreeView structure */}
          <TreeViewHeader
            canCreateFolderOrList={true}
            canEditOrUse={false}
            hideArchivedSessionsToggle={true}
            onHeaderClick={() => {}}
            onEditTemplate={() => {}}
            onUseTemplate={() => {}}
            onAddFolder={onAddFolder}
            onAddTemplate={onAddTemplate}
            onExport={onExport}
            onImport={onImport}
            onSignOut={onSignOut}
            onSwitchView={() => onViewModeChange('classic')}
            switchViewLabel="Classic View"
            canInstallApp={showInstallOption}
            onInstallApp={handleInstallApp}
            onAbout={() => {
              window.location.href = '/about.html';
            }}
          />

          {/* Template list */}
          <div className="divide-y divide-divider-secondary">
            {templatesWithPath.length === 0 ? (
              <div className="p-8 text-center text-content-tertiary">
                <p>No lists yet.</p>
                <p className="mt-1 text-sm">Create a list to get started.</p>
              </div>
            ) : (
              templatesWithPath.map(({ template, path }) => (
                <button
                  key={template.$jazz.id}
                  type="button"
                  onClick={() => onSelectTemplate(template.$jazz.id)}
                  className="w-full p-4 text-left hover:bg-interactive-hover transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-content-primary">{template.name}</h3>
                      <p className="text-sm text-content-tertiary">{path.replace(/\//g, ' / ')}</p>
                    </div>
                    <ShoppingCart className="h-5 w-5 text-content-disabled" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </main>

      {/* PWA Install Instructions Dialog */}
      <InstallInstructionsDialog open={showInstallDialog} onOpenChange={setShowInstallDialog} />
    </div>
  );
}
