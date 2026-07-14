import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { FolderTree, List } from 'lucide-react';
import type { FolderRow, SessionData, schema } from '@/schema/folder';
import * as SessionService from '@/services/sessionService';

type Graph = RelationalGraph<typeof schema>;

interface UseViewModeParams {
  template: FolderRow;
  session: SessionData | null;
  sessionId: string;
  g: Graph;
}

export function useViewMode({ template, session, sessionId, g }: UseViewModeParams) {
  const currentViewMode = session?.viewMode || 'zone-in-hierarchy';

  const cycleViewMode = () => {
    if (!session) {
      return;
    }
    const current = session.viewMode || 'zone-in-hierarchy';
    const next = current === 'flat' ? 'zone-in-hierarchy' : 'flat';
    SessionService.updateViewMode(g, template.id, sessionId, next);
  };

  const getViewModeLabel = () => {
    if (currentViewMode === 'flat') return 'Flat';
    return 'Zones in Categories';
  };

  const getViewModeIcon = () => {
    if (currentViewMode === 'flat') return List;
    return FolderTree;
  };

  return {
    currentViewMode,
    cycleViewMode,
    getViewModeLabel,
    getViewModeIcon,
  };
}
