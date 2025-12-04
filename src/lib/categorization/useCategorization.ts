/**
 * React hook for item categorization and suggestions
 *
 * Provides debounced suggestions as user types, with automatic
 * domain loading and initialization.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { initCategorization, isDomainLoaded, suggest } from './index';
import type { DomainId, Suggestion } from './types';

/**
 * Hook options
 */
interface UseCategorization {
  /** Domain to use for categorization (default: 'grocery') */
  domain?: DomainId;
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
 *   const { suggestions, setInput, isReady } = useCategorization();
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
  const { domain = 'grocery', debounceMs = 150, minChars = 2, maxSuggestions = 5 } = options;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastInputRef = useRef<string>('');

  // Initialize categorization system on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        console.log('[useCategorization] Initializing domain:', domain);
        await initCategorization(domain);
        if (!cancelled) {
          console.log('[useCategorization] Domain ready:', domain);
          setIsReady(true);
        }
      } catch (error) {
        console.error('[useCategorization] Failed to initialize categorization:', error);
      }
    }

    if (!isDomainLoaded(domain)) {
      init();
    } else {
      console.log('[useCategorization] Domain already loaded:', domain);
      setIsReady(true);
    }

    return () => {
      cancelled = true;
    };
  }, [domain]);

  // Update suggestions based on input
  const setInput = useCallback(
    (input: string) => {
      console.log('[useCategorization] setInput called:', input, 'isReady:', isReady);
      lastInputRef.current = input;

      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Clear suggestions for short input
      if (input.trim().length < minChars) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // Not ready yet
      if (!isReady) {
        console.log('[useCategorization] Not ready yet, skipping search');
        return;
      }

      setIsLoading(true);

      // Debounce the search
      debounceRef.current = setTimeout(() => {
        try {
          console.log('[useCategorization] Searching for:', input);
          const results = suggest(input, domain, maxSuggestions);
          console.log('[useCategorization] Results:', results.length);
          // Only update if input hasn't changed
          if (lastInputRef.current === input) {
            setSuggestions(results);
          }
        } catch (error) {
          console.error('[useCategorization] Suggestion error:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [domain, isReady, debounceMs, minChars, maxSuggestions],
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
    return () => {
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
