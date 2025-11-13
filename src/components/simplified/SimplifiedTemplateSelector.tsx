import type { InstanceOfSchema } from 'jazz-tools';
import { ShoppingCart } from 'lucide-react';
import type { ViewMode } from '@/components/AuthGate';
import { TreeViewHeader } from '@/components/tree/TreeViewHeader';
import type { Account, Template } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as templateService from '@/services/templateService';

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
  // Get all directory entries and filter for template-refs only
  const entries = directoryService.getAllDirectoryEntries(account, false);
  const templateEntries = entries.filter((e) => e.type === 'template-ref' && !e.archived);

  // Get templates
  const templates = templateEntries
    .map((entry) => {
      if (!entry.templateId) return null;
      const template = templateService.getTemplate(account, entry.templateId);
      return template ? { entry, template } : null;
    })
    .filter((t) => t !== null) as Array<{
    entry: { id: string; name: string; path: string };
    template: InstanceOfSchema<typeof Template>;
  }>;

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <main id="main-content" className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-neutral-200 bg-white">
          {/* Header matching TreeView structure */}
          <TreeViewHeader
            canCreateFolderOrList={true}
            canEditOrUse={false}
            hideArchivedToggle={true}
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
          />

          {/* Template list */}
          <div className="divide-y divide-neutral-100">
            {templates.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <p>No lists yet.</p>
                <p className="mt-1 text-sm">Create a list to get started.</p>
              </div>
            ) : (
              templates.map(({ entry, template }) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectTemplate(template.$jazz.id)}
                  className="w-full p-4 text-left hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-neutral-900">{entry.name}</h3>
                      <p className="text-sm text-neutral-500">{entry.path.replace(/\//g, ' / ')}</p>
                    </div>
                    <ShoppingCart className="h-5 w-5 text-neutral-400" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
