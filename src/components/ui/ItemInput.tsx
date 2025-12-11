/**
 * ItemInput - Unified component for adding items/categories with autocomplete
 *
 * Features:
 * - Autocomplete suggestions from grocery dictionary
 * - Keyboard navigation (Arrow keys, Tab, Enter, Escape)
 * - Item/Category type toggle
 * - Optional default quantity field
 * - Works inline or in dialogs
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCategorization } from '@/lib/categorization';
import type { AutocompleteDomain, Suggestion } from '@/lib/categorization/types';

export interface ItemInputValue {
  name: string;
  type: 'item' | 'category';
  defaultQuantity?: string;
  /** Category info from autocomplete suggestion (for auto-categorization) */
  categoryInfo?: {
    category: string;
    categoryName: string;
    subcategory?: string;
    subcategoryName?: string;
  };
}

export interface ItemInputProps {
  /** Called when user submits (Enter or button click) */
  onSubmit: (value: ItemInputValue) => void;
  /** Called when user cancels (Escape) */
  onCancel?: () => void;
  /** Whether to show the item/category type toggle (default: true) */
  showTypeToggle?: boolean;
  /** Whether to show the default quantity field (default: false) */
  showQuantityField?: boolean;
  /** Default type for new items (default: 'item') */
  defaultType?: 'item' | 'category';
  /** Placeholder text for the name input */
  placeholder?: string;
  /** Whether to auto-focus the input (default: true) */
  autoFocus?: boolean;
  /** Whether to clear the form after submit (default: true for rapid entry) */
  clearOnSubmit?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Layout variant */
  variant?: 'inline' | 'stacked';
  /** Autocomplete domain to use (default: 'grocery') */
  autocompleteDomain?: AutocompleteDomain;
}

export function ItemInput({
  onSubmit,
  onCancel,
  showTypeToggle = true,
  showQuantityField = false,
  defaultType = 'item',
  placeholder,
  autoFocus = true,
  clearOnSubmit = true,
  className = '',
  variant = 'inline',
  autocompleteDomain = 'grocery',
}: ItemInputProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'item' | 'category'>(defaultType);
  const [defaultQuantity, setDefaultQuantity] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(true);
  // Store category info from selected suggestion for auto-categorization
  const [selectedCategoryInfo, setSelectedCategoryInfo] = useState<{
    category: string;
    categoryName: string;
    subcategory?: string;
    subcategoryName?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { suggestions, setInput, clearSuggestions, getCategoryDisplay } = useCategorization({
    minChars: 2,
    maxSuggestions: 5,
    debounceMs: 100,
    autocompleteDomain,
  });

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Only show suggestions for items, not categories
  const visibleSuggestions = type === 'item' && showSuggestions ? suggestions : [];

  const handleReset = useCallback(() => {
    setName('');
    setDefaultQuantity('');
    clearSuggestions();
    setSelectedIndex(-1);
    setShowSuggestions(true);
    setSelectedCategoryInfo(null);
  }, [clearSuggestions]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmedName = name.trim();
      if (!trimmedName) return;

      onSubmit({
        name: trimmedName,
        type,
        defaultQuantity: defaultQuantity.trim() || undefined,
        categoryInfo: selectedCategoryInfo ?? undefined,
      });

      if (clearOnSubmit) {
        handleReset();
        inputRef.current?.focus();
      }
    },
    [name, type, defaultQuantity, selectedCategoryInfo, onSubmit, clearOnSubmit, handleReset],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setName(value);
      if (type === 'item') {
        setInput(value);
      }
      setSelectedIndex(-1);
      setShowSuggestions(true);
      // Clear category info when user manually types (no longer using autocomplete)
      setSelectedCategoryInfo(null);
    },
    [type, setInput],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      setName(suggestion.text);
      setShowSuggestions(false);
      clearSuggestions();
      setSelectedIndex(-1);
      // Store category info for auto-categorization
      setSelectedCategoryInfo({
        category: suggestion.category,
        categoryName: suggestion.categoryName,
        subcategory: suggestion.subcategory,
        subcategoryName: suggestion.subcategoryName,
      });
      inputRef.current?.focus();
    },
    [clearSuggestions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape handling
      if (e.key === 'Escape') {
        if (visibleSuggestions.length > 0 && showSuggestions) {
          // First escape clears suggestions
          setShowSuggestions(false);
          clearSuggestions();
        } else {
          onCancel?.();
        }
        return;
      }

      // Arrow key navigation for suggestions
      if (visibleSuggestions.length > 0 && showSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < visibleSuggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        } else if ((e.key === 'Tab' || e.key === 'Enter') && selectedIndex >= 0) {
          e.preventDefault();
          handleSelectSuggestion(visibleSuggestions[selectedIndex]);
        }
      }
    },
    [
      visibleSuggestions,
      showSuggestions,
      selectedIndex,
      clearSuggestions,
      onCancel,
      handleSelectSuggestion,
    ],
  );

  const handleTypeChange = useCallback(
    (newType: 'item' | 'category') => {
      setType(newType);
      if (newType === 'category') {
        clearSuggestions();
        setShowSuggestions(false);
      } else {
        setShowSuggestions(true);
        if (name.length >= 2) {
          setInput(name);
        }
      }
    },
    [clearSuggestions, setInput, name],
  );

  const defaultPlaceholder = placeholder || (type === 'item' ? 'Item name...' : 'Category name...');

  const isStacked = variant === 'stacked';

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className={isStacked ? 'flex flex-col gap-3' : 'flex flex-col gap-2 sm:flex-row'}>
        {/* Name input with suggestions */}
        <div className={`relative ${isStacked ? '' : 'flex-1'}`}>
          <div className={isStacked ? '' : 'flex gap-2'}>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={handleNameChange}
              onKeyDown={handleKeyDown}
              placeholder={defaultPlaceholder}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={visibleSuggestions.length > 0}
              aria-controls={visibleSuggestions.length > 0 ? 'item-suggestions-list' : undefined}
              aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
              className="flex-1 min-w-0 rounded border border-divider-primary bg-surface-elevated px-3 py-2 text-base text-content-primary placeholder:text-content-disabled focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {!isStacked && (
              <button
                type="submit"
                disabled={!name.trim()}
                className="flex items-center justify-center rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                aria-label="Add"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {visibleSuggestions.length > 0 && (
            <div
              id="item-suggestions-list"
              role="listbox"
              aria-label="Item suggestions"
              className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg max-h-48 overflow-auto"
            >
              {visibleSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion.text}
                  id={`suggestion-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  tabIndex={-1}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    tabIndex={-1}
                    className={`w-full px-3 py-2 text-left hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center justify-between ${
                      index === selectedIndex ? 'bg-green-100 dark:bg-green-900/50' : ''
                    }`}
                  >
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {suggestion.text}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                      {getCategoryDisplay(suggestion)}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type toggle */}
        {showTypeToggle && (
          <div
            className={`flex items-center gap-3 rounded border border-divider-primary bg-surface-elevated px-3 py-2 ${
              isStacked ? '' : 'sm:shrink-0'
            }`}
          >
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="itemType"
                value="item"
                checked={type === 'item'}
                onChange={() => handleTypeChange('item')}
                className="w-4 h-4 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-content-secondary">Item</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="itemType"
                value="category"
                checked={type === 'category'}
                onChange={() => handleTypeChange('category')}
                className="w-4 h-4 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-content-secondary">Category</span>
            </label>
          </div>
        )}

        {/* Default quantity field (optional) */}
        {showQuantityField && type === 'item' && (
          <input
            type="text"
            value={defaultQuantity}
            onChange={(e) => setDefaultQuantity(e.target.value)}
            placeholder="Qty (optional)"
            className={`rounded border border-divider-primary bg-surface-elevated px-3 py-2 text-base text-content-primary placeholder:text-content-disabled focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 ${
              isStacked ? '' : 'w-32 shrink-0'
            }`}
          />
        )}

        {/* Submit button for stacked layout */}
        {isStacked && (
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full rounded bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add {type === 'item' ? 'Item' : 'Category'}
          </button>
        )}
      </div>
    </form>
  );
}
