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
 * Note: This component accepts emoji strings for the icon prop for backward compatibility.
 * For new implementations, consider using Lucide React icon components directly instead.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="📋"
 *   title="No templates yet"
 *   description="Create your first template to get started."
 * />
 * ```
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-5xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-content-secondary">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
