import type { InstanceOfSchema } from 'jazz-tools';
import { FolderTree, Layers, List } from 'lucide-react';
import type { Account, Session, Template } from '@/schemas';
import * as SessionService from '@/services/sessionService';

interface UseViewModeParams {
  template: InstanceOfSchema<typeof Template>;
  session: InstanceOfSchema<typeof Session> | null;
  sessionId: string;
  me: InstanceOfSchema<typeof Account> | null;
}

export function useViewMode({ template, session, sessionId, me }: UseViewModeParams) {
  const currentViewMode = session?.viewMode || 'zone-in-hierarchy';

  const cycleViewMode = () => {
    if (!session || !me) return;
    const current = session.viewMode || 'zone-in-hierarchy';
    const next =
      current === 'flat'
        ? 'hierarchy-in-zones'
        : current === 'hierarchy-in-zones'
          ? 'zone-in-hierarchy'
          : 'flat';
    SessionService.updateViewMode(me, template.$jazz.id, sessionId, next);
  };

  const getViewModeLabel = () => {
    if (currentViewMode === 'flat') return 'Flat';
    if (currentViewMode === 'hierarchy-in-zones') return 'Categories in Zones';
    return 'Zones in Categories';
  };

  const getViewModeIcon = () => {
    if (currentViewMode === 'flat') return List;
    if (currentViewMode === 'hierarchy-in-zones') return Layers;
    return FolderTree;
  };

  return {
    currentViewMode,
    cycleViewMode,
    getViewModeLabel,
    getViewModeIcon,
  };
}
