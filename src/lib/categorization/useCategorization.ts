/**
 * React hook for item categorization and suggestions
 *
 * Provides debounced suggestions as user types, with automatic
 * domain loading and initialization.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategorySync, getImplementedDomains, searchWithDomain } from './domainLoader';
import type { AutocompleteDomain, Suggestion } from './types';

/**
 * Hook options
 */
interface UseCategorization {
  /** Autocomplete domain setting: 'none', 'grocery', 'hardware', 'all' (default: 'grocery') */
  autocompleteDomain?: AutocompleteDomain;
  /** Debounce delay in ms (default: 150) */
  debounceMs?: number;
  /** Minimum characters before suggesting (default: 2) */
  minChars?: number;
  /** Maximum suggestions to show (default: 5) */
  maxSuggestions?: number;
}

/**
 * Hook return value
 */
interface UseCategorizeResult {
  /** Current suggestions based on input */
  suggestions: Suggestion[];
  /** Whether the categorization system is ready */
  isReady: boolean;
  /** Whether suggestions are currently loading */
  isLoading: boolean;
  /** Update input to get new suggestions */
  setInput: (input: string) => void;
  /** Clear current suggestions */
  clearSuggestions: () => void;
  /** Get category info for a suggestion */
  getCategoryDisplay: (suggestion: Suggestion) => string;
}

/**
 * React hook for item categorization
 *
 * @example
 * ```tsx
 * function ItemInput() {
 *   const [name, setName] = useState('');
 *   const { suggestions, setInput, isReady } = useCategorization({
 *     autocompleteDomain: 'grocery' // or 'hardware', 'all', 'none'
 *   });
 *
 *   const handleChange = (e) => {
 *     setName(e.target.value);
 *     setInput(e.target.value);
 *   };
 *
 *   return (
 *     <div>
 *       <input value={name} onChange={handleChange} />
 *       {suggestions.map(s => (
 *         <div key={s.text}>{s.text} - {s.categoryName}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCategorization(options: UseCategorization = {}): UseCategorizeResult {
  const {
    autocompleteDomain = 'grocery',
    debounceMs = 150,
    minChars = 2,
    maxSuggestions = 5,
  } = options;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isReady, setIsReady] = useState(autocompleteDomain === 'none');
  const [isLoading, setIsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastInputRef = useRef<string>('');
  const mountedRef = useRef(true);

  // Initialize when domain changes (domains are loaded on-demand)
  useEffect(() => {
    // If 'none', we're always ready (but won't do anything)
    if (autocompleteDomain === 'none') {
      setIsReady(true);
      return;
    }

    // For 'all', we use the implemented domains list
    // The searchWithDomain function handles loading on demand
    // We just set ready to true and let the async search handle loading
    setIsReady(true);
  }, [autocompleteDomain]);

  // Update suggestions based on input
  const setInput = useCallback(
    (input: string) => {
      lastInputRef.current = input;

      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Autocomplete disabled
      if (autocompleteDomain === 'none') {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // Clear suggestions for short input
      if (input.trim().length < minChars) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Debounce the search
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchWithDomain(autocompleteDomain, input, maxSuggestions);

          // Convert SearchResult to Suggestion format
          const formattedResults: Suggestion[] = results.map((result) => {
            const domainId = result.item.domain || getImplementedDomains()[0];
            const category = getCategorySync(domainId, result.item.category);
            const subcategory = result.item.subcategory
              ? category?.subcategories?.find((s) => s.id === result.item.subcategory)
              : undefined;

            return {
              text: result.item.name,
              category: result.item.category,
              categoryName: category?.name || result.item.category,
              subcategory: result.item.subcategory,
              subcategoryName: subcategory?.name,
              score: result.score,
              domain: domainId,
            };
          });

          // Only update if input hasn't changed and component is still mounted
          if (mountedRef.current && lastInputRef.current === input) {
            setSuggestions(formattedResults);
          }
        } catch (error) {
          console.error('[useCategorization] Suggestion error:', error);
          if (mountedRef.current) {
            setSuggestions([]);
          }
        } finally {
          if (mountedRef.current) {
            setIsLoading(false);
          }
        }
      }, debounceMs);
    },
    [autocompleteDomain, debounceMs, minChars, maxSuggestions],
  );

  // Clear suggestions
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    lastInputRef.current = '';
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Format category for display
  const getCategoryDisplay = useCallback((suggestion: Suggestion): string => {
    if (suggestion.subcategoryName) {
      return `${suggestion.categoryName} › ${suggestion.subcategoryName}`;
    }
    return suggestion.categoryName;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    suggestions,
    isReady,
    isLoading,
    setInput,
    clearSuggestions,
    getCategoryDisplay,
  };
}
