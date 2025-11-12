import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface InlineItemFormProps {
  onSubmit: (name: string, type: 'item' | 'category') => void;
  onClose: () => void;
}

/**
 * InlineItemForm - Inline form for adding items/categories
 * Triggered by plus (+) button, supports rapid entry workflow
 */
export function InlineItemForm({ onSubmit, onClose }: InlineItemFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'item' | 'category'>('item');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (name.trim()) {
      onSubmit(name.trim(), type);
      setName(''); // Clear form for rapid entry
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-green-50 border border-green-200 rounded-md p-4">
      <div className="flex items-start gap-3">
        {/* Text input */}
        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter item or category name..."
            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />

          {/* Radio buttons */}
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="item"
                checked={type === 'item'}
                onChange={() => setType('item')}
                className="w-4 h-4 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-neutral-700">Item</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="category"
                checked={type === 'category'}
                onChange={() => setType('category')}
                className="w-4 h-4 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-neutral-700">Category</span>
            </label>
          </div>
        </div>

        {/* Close button */}
        <Button
          type="button"
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close form"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint text */}
      <p className="text-xs text-neutral-500 mt-2">Press Enter to add, Escape to close</p>
    </form>
  );
}
