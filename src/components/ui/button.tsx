import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-green-600 text-white hover:bg-green-700',
        secondary:
          'border border-divider-primary bg-surface-elevated text-content-primary hover:bg-interactive-hover',
        outline:
          'border border-green-600 bg-surface-elevated text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30',
        ghost: 'hover:bg-interactive-hover text-content-primary',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        link: 'text-green-600 underline-offset-4 hover:underline',
        dark: 'border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800',
      },
      size: {
        sm: 'h-10 px-3 text-sm min-h-[40px]',
        md: 'h-11 px-4 min-h-[44px]',
        lg: 'h-12 px-6 min-h-[48px]',
        icon: 'h-11 w-11 p-0 min-h-[44px] min-w-[44px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

/**
 * Button component with multiple variants for different use cases
 *
 * @example
 * ```tsx
 * <Button variant="primary">Save</Button>
 * <Button variant="secondary">Cancel</Button>
 * <Button variant="outline" size="sm">Edit</Button>
 * <Button variant="ghost" size="icon"><Icon /></Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
