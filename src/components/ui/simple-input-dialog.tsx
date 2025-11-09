import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

interface SimpleInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
  title: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  submitButtonText: string;
  /** Optional function to generate default value */
  defaultValueGenerator?: () => string;
  /** Whether the input is required (default: false) */
  required?: boolean;
  /** Optional helper text below input */
  helperText?: string;
}

export function SimpleInputDialog({
  open,
  onOpenChange,
  onSubmit,
  title,
  description,
  inputLabel,
  inputPlaceholder,
  submitButtonText,
  defaultValueGenerator,
  required = false,
  helperText,
}: SimpleInputDialogProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalValue = value.trim() || (defaultValueGenerator ? defaultValueGenerator() : '');

    // If required and no value, don't submit
    if (required && !finalValue) {
      return;
    }

    onSubmit(finalValue);
    setValue('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setValue('');
    onOpenChange(false);
  };

  const canSubmit = !required || value.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <FormField
              label={inputLabel}
              htmlFor="input-field"
              required={required}
              helperText={helperText}
            >
              <Input
                id="input-field"
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputPlaceholder}
                autoFocus
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleCancel} variant="secondary">
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} variant="primary">
              {submitButtonText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
