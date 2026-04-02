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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export interface ExistingItem {
  id: string;
  name: string;
  isSelected: boolean;
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
  /** Existing template items to search/match against */
  existingItems?: ExistingItem[];
  /** Called when user selects an existing item (toggles it) */
  onSelectExisting?: (itemId: string) => void;
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
  existingItems,
  onSelectExisting,
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

  // Match existing template items against input
  const matchingExisting = useMemo(() => {
    if (!existingItems || type !== 'item' || !showSuggestions || name.trim().length < 2) return [];
    const query = name.trim().toLowerCase();
    return existingItems
      .filter((item) => item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prefer starts-with over contains
        const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [existingItems, type, showSuggestions, name]);

  // Combined dropdown: existing items first, then dictionary suggestions
  const cappedSuggestions =
    matchingExisting.length > 0
      ? visibleSuggestions.slice(0, Math.max(3, 8 - matchingExisting.length))
      : visibleSuggestions;

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

  const handleSelectExistingItem = useCallback(
    (itemId: string) => {
      onSelectExisting?.(itemId);
      // Clear input and refocus for continued use
      setName('');
      clearSuggestions();
      setSelectedIndex(-1);
      setShowSuggestions(true);
      setSelectedCategoryInfo(null);
      inputRef.current?.focus();
    },
    [onSelectExisting, clearSuggestions],
  );

  // Total items in dropdown for keyboard navigation
  const dropdownLength = matchingExisting.length + cappedSuggestions.length;
  const hasDropdown = dropdownLength > 0 && showSuggestions;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape handling
      if (e.key === 'Escape') {
        if (hasDropdown) {
          // First escape clears suggestions
          setShowSuggestions(false);
          clearSuggestions();
        } else {
          onCancel?.();
        }
        return;
      }

      // Arrow key navigation for combined dropdown
      if (hasDropdown) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < dropdownLength - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        } else if ((e.key === 'Tab' || e.key === 'Enter') && selectedIndex >= 0) {
          e.preventDefault();
          // Determine which section the selected index falls in
          if (selectedIndex < matchingExisting.length) {
            handleSelectExistingItem(matchingExisting[selectedIndex].id);
          } else {
            handleSelectSuggestion(cappedSuggestions[selectedIndex - matchingExisting.length]);
          }
        }
      }
    },
    [
      hasDropdown,
      dropdownLength,
      selectedIndex,
      matchingExisting,
      cappedSuggestions,
      clearSuggestions,
      onCancel,
      handleSelectSuggestion,
      handleSelectExistingItem,
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
              maxLength={200}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={hasDropdown}
              aria-controls={hasDropdown ? 'item-suggestions-list' : undefined}
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

          {/* Combined dropdown: existing items + dictionary suggestions */}
          {hasDropdown && (
            <div
              id="item-suggestions-list"
              role="listbox"
              aria-label="Item suggestions"
              className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg max-h-48 overflow-auto"
            >
              {/* Existing template items section */}
              {matchingExisting.length > 0 && (
                <>
                  {cappedSuggestions.length > 0 && (
                    <div className="px-3 py-1 text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
                      In template
                    </div>
                  )}
                  {matchingExisting.map((item, index) => (
                    <div
                      key={item.id}
                      id={`suggestion-${index}`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      tabIndex={-1}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectExistingItem(item.id)}
                        tabIndex={-1}
                        className={`w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2 ${
                          index === selectedIndex ? 'bg-blue-100 dark:bg-blue-900/50' : ''
                        }`}
                      >
                        <span
                          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                            item.isSelected
                              ? 'bg-green-600 border-green-600 text-white'
                              : 'border-neutral-300 dark:border-neutral-600'
                          }`}
                        >
                          {item.isSelected && (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="text-neutral-800 dark:text-neutral-200 truncate">
                          {item.name}
                        </span>
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Dictionary suggestions section */}
              {cappedSuggestions.length > 0 && (
                <>
                  {matchingExisting.length > 0 && (
                    <div className="px-3 py-1 text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide border-t border-neutral-200 dark:border-neutral-700">
                      Add new
                    </div>
                  )}
                  {cappedSuggestions.map((suggestion, index) => {
                    const globalIndex = matchingExisting.length + index;
                    return (
                      <div
                        key={suggestion.text}
                        id={`suggestion-${globalIndex}`}
                        role="option"
                        aria-selected={globalIndex === selectedIndex}
                        tabIndex={-1}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          tabIndex={-1}
                          className={`w-full px-3 py-2 text-left hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center justify-between ${
                            globalIndex === selectedIndex ? 'bg-green-100 dark:bg-green-900/50' : ''
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
                    );
                  })}
                </>
              )}
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
            maxLength={50}
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
