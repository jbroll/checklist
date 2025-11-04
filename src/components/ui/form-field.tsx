import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * FormField component that wraps a form input with label and optional error message.
 * Provides consistent spacing, layout, and accessibility attributes.
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Email"
 *   htmlFor="email"
 *   error="Email is required"
 *   required
 * >
 *   <Input id="email" type="email" />
 * </FormField>
 * ```
 */

interface FormFieldProps {
  /** Label text for the form field */
  label: string;
  /** ID of the input element this label is for */
  htmlFor: string;
  /** Error message to display below the input */
  error?: string;
  /** Whether this field is required */
  required?: boolean;
  /** Helper text to display below the label */
  helperText?: string;
  /** The input element(s) to render */
  children: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  required = false,
  helperText,
  children,
  className,
}: FormFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const helperId = helperText ? `${htmlFor}-helper` : undefined;

  // Clone children and add accessibility attributes
  const childrenWithProps = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : helperId,
        ...child.props,
      } as React.HTMLAttributes<HTMLElement>);
    }
    return child;
  });

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </Label>
      {helperText && !error && (
        <p id={helperId} className="text-xs text-neutral-500">
          {helperText}
        </p>
      )}
      {childrenWithProps}
      {error && (
        <p id={errorId} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
