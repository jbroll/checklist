import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Empty state component for displaying when no data is available
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="📋"
 *   title="No templates yet"
 *   description="Create your first template to get started."
 * />
 *
 * <EmptyState
 *   icon="🛒"
 *   title="No active session"
 *   description="Start a shopping session to begin tracking items."
 *   action={<Button>Start Session</Button>}
 * />
 * ```
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-5xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-neutral-600">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
