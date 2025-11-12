import type { InstanceOfSchema } from 'jazz-tools';
import { ShoppingCart } from 'lucide-react';
import type { ViewMode } from '@/components/AuthGate';
import { Button } from '@/components/ui/button';
import type { Account, Template } from '@/schemas';
import * as directoryService from '@/services/directoryService';
import * as templateService from '@/services/templateService';

interface SimplifiedTemplateSelectorProps {
  account: InstanceOfSchema<typeof Account>;
  onSelectTemplate: (templateId: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * SimplifiedTemplateSelector - Shows list of templates for user to choose from
 * Simple list view (no complex tree navigation)
 */
export function SimplifiedTemplateSelector({
  account,
  onSelectTemplate,
  onViewModeChange,
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
      <main id="main-content" className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <ShoppingCart className="h-10 w-10 text-neutral-900" />
            <h1 className="text-4xl font-bold text-neutral-900">BubbleList</h1>
          </div>
          <p className="text-neutral-600">Select a list to start shopping</p>
        </div>

        {/* Template list */}
        <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
          {templates.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-neutral-600 mb-4">No lists available</p>
              <Button onClick={() => onViewModeChange('classic')} variant="secondary">
                Switch to Classic View to create lists
              </Button>
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

        {/* Footer with switch to classic */}
        <div className="mt-6 text-center">
          <Button onClick={() => onViewModeChange('classic')} variant="ghost" size="sm">
            Switch to Classic View
          </Button>
        </div>
      </main>
    </div>
  );
}
