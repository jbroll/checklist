import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin rounded-full border-neutral-300 border-t-neutral-900', {
  variants: {
    size: {
      sm: 'h-4 w-4 border-2',
      md: 'h-6 w-6 border-2',
      lg: 'h-8 w-8 border-4',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

interface LoadingSpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string;
}

/**
 * Loading spinner component
 *
 * @example
 * ```tsx
 * <LoadingSpinner size="sm" />
 * <LoadingSpinner size="lg" />
 * ```
 */
export function LoadingSpinner({ size, className }: LoadingSpinnerProps) {
  return <div className={cn(spinnerVariants({ size, className }))} />;
}

interface LoadingScreenProps {
  message?: string;
}

/**
 * Full-screen loading component with optional message
 *
 * @example
 * ```tsx
 * <LoadingScreen />
 * <LoadingScreen message="Loading your templates..." />
 * ```
 */
export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto" />
        <p className="mt-4 text-sm text-neutral-600">{message}</p>
      </div>
    </div>
  );
}
