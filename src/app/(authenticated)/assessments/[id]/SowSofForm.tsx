'use client';

/**
 * SoW/SoF Declaration Form
 *
 * Renders a form from config (radio, text, checkbox fields).
 * On submit, calls saveSowSofForm server action.
 * Pre-populates from existing saved data.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSowSofForm } from '@/app/actions/evidence';
import type { FormConfig } from '@/lib/rules-engine/types';
import styles from './page.module.css';

interface FormFieldConfig {
  id: string;
  type: string;
  label?: string | { value: string; options: string[] };
  validation?: string[];
  hint?: string;
  fields?: string[];
}

interface SowSofFormProps {
  formType: 'sow' | 'sof';
  formConfig: FormConfig;
  assessmentId: string;
  existingData?: Record<string, string | string[]> | null;
  onClose: () => void;
}

export function SowSofForm({
  formType,
  formConfig,
  assessmentId,
  existingData,
  onClose,
}: SowSofFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>(
    existingData || {}
  );

  // Build a flat field map by ID
  const fieldMap = new Map<string, FormFieldConfig>();
  for (const field of formConfig.fields as FormFieldConfig[]) {
    fieldMap.set(field.id, field);
  }

  // Find the top-level section to get ordered field IDs
  const topSection = (formConfig.fields as FormFieldConfig[]).find(
    (f) => f.type === 'section' && f.fields
  );
  const fieldIds = topSection?.fields || [];

  function handleRadioChange(fieldId: string, value: string) {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
    setSaved(false);
  }

  function handleTextChange(fieldId: string, value: string) {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
    setSaved(false);
  }

  function handleCheckboxChange(fieldId: string, option: string, checked: boolean) {
    setFormValues((prev) => {
      const current = Array.isArray(prev[fieldId]) ? [...(prev[fieldId] as string[])] : [];
      if (checked) {
        current.push(option);
      } else {
        const idx = current.indexOf(option);
        if (idx >= 0) current.splice(idx, 1);
      }
      return { ...prev, [fieldId]: current };
    });
    setSaved(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic validation — check required fields
    for (const fid of fieldIds) {
      const field = fieldMap.get(fid);
      if (!field || field.type === 'section') continue;
      if (field.validation?.includes('required')) {
        const val = formValues[fid];
        if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && !val.trim())) {
          const label = typeof field.label === 'string' ? field.label : field.label?.value || fid;
          setError(`"${label}" is required.`);
          return;
        }
      }
    }

    startTransition(async () => {
      const result = await saveSowSofForm(assessmentId, formType, formValues);
      if (!result.success) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function renderField(fieldId: string) {
    const field = fieldMap.get(fieldId);
    if (!field || field.type === 'section') return null;

    const label = typeof field.label === 'string' ? field.label : field.label?.value || '';
    const options = typeof field.label === 'object' ? field.label.options : undefined;
    const isRequired = field.validation?.includes('required');

    return (
      <div key={fieldId} className={styles.formField}>
        <label className={styles.formLabel}>
          {label}
          {isRequired && <span style={{ color: '#dc2626' }}> *</span>}
        </label>
        {field.hint && (
          <p className={styles.formHint}>{field.hint}</p>
        )}

        {field.type === 'radio' && options && (
          <div className={styles.radioGroup}>
            {options.map((opt) => (
              <label key={opt} className={styles.radioOption}>
                <input
                  type="radio"
                  name={fieldId}
                  value={opt}
                  checked={formValues[fieldId] === opt}
                  onChange={() => handleRadioChange(fieldId, opt)}
                  disabled={isPending}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}

        {field.type === 'checkbox' && options && (
          <div className={styles.radioGroup}>
            {options.map((opt) => {
              const currentArr = Array.isArray(formValues[fieldId]) ? formValues[fieldId] as string[] : [];
              return (
                <label key={opt} className={styles.radioOption}>
                  <input
                    type="checkbox"
                    checked={currentArr.includes(opt)}
                    onChange={(e) => handleCheckboxChange(fieldId, opt, e.target.checked)}
                    disabled={isPending}
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        )}

        {field.type === 'text' && (
          <textarea
            value={(formValues[fieldId] as string) || ''}
            onChange={(e) => handleTextChange(fieldId, e.target.value)}
            rows={3}
            className={styles.formTextarea}
            disabled={isPending}
          />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.evidenceForm}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong>{formConfig.name}</strong>
        <button
          type="button"
          onClick={onClose}
          className={styles.evidenceActionButton}
          style={{ fontSize: '0.8125rem' }}
        >
          Close
        </button>
      </div>

      {error && <div className={styles.evidenceError}>{error}</div>}
      {saved && (
        <div style={{ padding: '0.5rem 0.75rem', background: '#dcfce7', color: '#166534', borderRadius: '0.375rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Declaration saved successfully.
        </div>
      )}

      {fieldIds.map((fid) => renderField(fid))}

      <button type="submit" disabled={isPending} className={styles.formSubmit}>
        {isPending ? 'Saving...' : 'Save Declaration'}
      </button>
    </form>
  );
}
