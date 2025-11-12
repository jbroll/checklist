import type { InstanceOfSchema } from 'jazz-tools';
import { useState } from 'react';
import type { ViewMode } from '@/components/AuthGate';
import type { Account } from '@/schemas';
import * as templateService from '@/services/templateService';
import { SimplifiedSessionView } from './SimplifiedSessionView';
import { SimplifiedTemplateSelector } from './SimplifiedTemplateSelector';

interface SimplifiedAppProps {
  account: InstanceOfSchema<typeof Account>;
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * Top-level container for the simplified UI mode
 * This is a completely separate component tree from the classic Dashboard/TreeView
 * Manages navigation between template selection and session view
 */
export function SimplifiedApp({ account, onViewModeChange }: SimplifiedAppProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

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

  // Otherwise show template selector
  return (
    <SimplifiedTemplateSelector
      account={account}
      onSelectTemplate={setSelectedTemplateId}
      onViewModeChange={onViewModeChange}
    />
  );
}
