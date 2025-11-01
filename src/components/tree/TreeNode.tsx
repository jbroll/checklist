import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface TreeNodeProps {
  level: number;
  expanded: boolean;
  onToggleExpand: () => void;
  hasChildren: boolean;
  children: ReactNode;
  className?: string;
}

export function TreeNode({
  level,
  expanded,
  onToggleExpand,
  hasChildren,
  children,
  className = '',
}: TreeNodeProps) {
  const indent = level * 20; // 20px per level

  return (
    <div
      className={`flex items-center gap-1 py-1 ${className}`}
      style={{ paddingLeft: `${indent}px` }}
    >
      {/* Expand/Collapse Toggle */}
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-neutral-200"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-600" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-600" />
          )}
        </button>
      ) : (
        <div className="h-5 w-5" /> // Spacer for items without children
      )}

      {/* Content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
