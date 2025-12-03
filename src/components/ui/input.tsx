import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md bg-surface-elevated text-content-primary text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-content-disabled focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'h-10 border border-divider-tertiary px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-500/20',
        inline: 'border border-green-500 px-2 py-0.5 focus:ring-2 focus:ring-green-500/20',
      },
      state: {
        default: '',
        error: 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
      state: 'default',
    },
  },
);

interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

/**
 * Input component with multiple variants for different use cases
 *
 * @example
 * ```tsx
 * <Input placeholder="Enter name..." />
 * <Input variant="inline" value={name} />
 * <Input state="error" />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, state, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputVariants({ variant, state, className }))}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
