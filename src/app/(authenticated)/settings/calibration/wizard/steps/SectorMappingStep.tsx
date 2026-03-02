'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Json } from '@/lib/supabase/types';
import styles from '../wizard.module.css';

interface StepProps {
  initialData: Json;
  onSaveAndNext: (data: unknown) => void;
  onBack: () => void;
  saving: boolean;
}

const CATEGORIES = ['Standard', 'Higher-risk', 'Prohibited'] as const;
type Category = (typeof CATEGORIES)[number];

/** Sectors that are mandatory-prohibited per regulatory baseline and cannot be changed. */
const MANDATORY_PROHIBITED = new Set([
  'Weapons or defence brokering',
  'Shell company with no legitimate purpose',
  'Unlicensed money services',
  'Opaque ownership structure with unverifiable BO',
]);

interface SectorEntry {
  name: string;
  category: Category;
  locked: boolean;
}

function parseSectorMapping(data: Json): { version: string; sectors: SectorEntry[] } {
  const defaultVersion = '1.0';
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { version: defaultVersion, sectors: [] };
  }

  const d = data as Record<string, Json>;
  const version = typeof d.version === 'string' ? d.version : defaultVersion;
  const categories = d.categories;

  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    return { version, sectors: [] };
  }

  const cats = categories as Record<string, Json>;
  const sectors: SectorEntry[] = [];

  for (const cat of CATEGORIES) {
    const sectorList = cats[cat];
    if (Array.isArray(sectorList)) {
      for (const sector of sectorList) {
        if (typeof sector === 'string') {
          sectors.push({
            name: sector,
            category: cat,
            locked: MANDATORY_PROHIBITED.has(sector),
          });
        }
      }
    }
  }

  // Sort alphabetically by name
  sectors.sort((a, b) => a.name.localeCompare(b.name));

  return { version, sectors };
}

function buildSectorMappingOutput(
  version: string,
  sectors: SectorEntry[]
): Record<string, unknown> {
  const categories: Record<string, string[]> = {
    Standard: [],
    'Higher-risk': [],
    Prohibited: [],
  };

  for (const sector of sectors) {
    categories[sector.category].push(sector.name);
  }

  return { version, categories };
}

export function SectorMappingStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const parsed = useMemo(() => parseSectorMapping(initialData), [initialData]);
  const [sectors, setSectors] = useState<SectorEntry[]>(parsed.sectors);

  const handleCategoryChange = useCallback((sectorName: string, newCategory: Category) => {
    setSectors((prev) =>
      prev.map((s) =>
        s.name === sectorName && !s.locked
          ? { ...s, category: newCategory }
          : s
      )
    );
  }, []);

  function handleSave() {
    const output = buildSectorMappingOutput(parsed.version, sectors);
    onSaveAndNext(output);
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 5: Sector Mapping</h2>
      <p className={styles.stepDescription}>
        Assign each sector to a risk category. Mandatory-prohibited sectors are locked
        per regulatory baseline and cannot be changed.
      </p>

      <table className={styles.configTable}>
        <thead>
          <tr>
            <th>Sector</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <tr
              key={sector.name}
              className={sector.locked ? styles.lockedRow : undefined}
            >
              <td>
                {sector.name}
                {sector.locked && (
                  <>
                    {' '}
                    <span className={styles.lockedBadge}>Locked</span>
                  </>
                )}
              </td>
              <td>
                {sector.locked ? (
                  <span>{sector.category}</span>
                ) : (
                  <select
                    className={styles.formSelect}
                    value={sector.category}
                    onChange={(e) =>
                      handleCategoryChange(sector.name, e.target.value as Category)
                    }
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.navButtonSecondary}
          onClick={onBack}
          disabled={saving}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.navButtonPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
