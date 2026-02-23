'use client';

/**
 * Country Multi-Select with Typeahead
 *
 * Text input with autocomplete dropdown for selecting multiple countries.
 * Selected countries appear as removable chips below the input.
 * Stores value as comma-separated string for FormAnswers compatibility.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { COUNTRIES } from '@/data/countries';
import styles from './countryMultiSelect.module.css';

interface CountryMultiSelectProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CountryMultiSelect({ value, onChange, readOnly }: CountryMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const filtered = query.length >= 1
    ? COUNTRIES.filter(
        (c) =>
          c.toLowerCase().includes(query.toLowerCase()) &&
          !selected.includes(c)
      ).slice(0, 10)
    : [];

  const addCountry = useCallback(
    (country: string) => {
      const updated = [...selected, country];
      onChange(updated.join(', '));
      setQuery('');
      setIsOpen(false);
    },
    [selected, onChange]
  );

  const removeCountry = useCallback(
    (country: string) => {
      const updated = selected.filter((c) => c !== country);
      onChange(updated.join(', '));
    },
    [selected, onChange]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputWrapper}>
        <input
          type="text"
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.length >= 1);
          }}
          onFocus={() => {
            if (query.length >= 1) setIsOpen(true);
          }}
          placeholder="Type to search countries..."
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
        />
        {isOpen && filtered.length > 0 && (
          <div className={styles.dropdown}>
            {filtered.map((country) => (
              <div
                key={country}
                className={styles.dropdownItem}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addCountry(country);
                }}
              >
                {country}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((country) => (
            <span key={country} className={styles.chip}>
              {country}
              {!readOnly && (
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => removeCountry(country)}
                  aria-label={`Remove ${country}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
