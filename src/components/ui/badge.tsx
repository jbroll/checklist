import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-neutral-100 text-neutral-700',
        primary: 'bg-green-100 text-green-700',
        success: 'bg-green-100 text-green-700',
        warning: 'bg-amber-100 text-amber-700',
        error: 'bg-red-100 text-red-700',
        info: 'bg-blue-100 text-blue-700',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

/**
 * Badge component for displaying status, counts, or categories
 *
 * @example
 * ```tsx
 * <Badge variant="neutral">{count}</Badge>
 * <Badge variant="success">Active</Badge>
 * <Badge variant="info">2 lbs</Badge>
 * ```
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
