'use client';

/**
 * Assessment Form Component
 * Renders dynamic CMLRA form based on config and submits via deterministic engine.
 * Supports pre-populated fields (read-only), entity-type-aware labels,
 * and currency formatting.
 */

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitAssessment } from '@/app/actions/assessments';
import { QuestionHelperButton } from '@/components/assistant/QuestionHelperButton';
import { CountryMultiSelect } from '@/components/forms/CountryMultiSelect';
import type { FormAnswers } from '@/lib/rules-engine/types';
import styles from './page.module.css';

interface FormFieldLabel {
  value: string;
  options: string[];
}

interface RichTextContent {
  type: string;
  content?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
}

interface FormField {
  id: string;
  type: string;
  label?: string | FormFieldLabel;
  validation?: string[];
  hint?: string | null;
  show_if?: Record<string, string>;
  smart_logic_fields?: string[];
  fields?: string[];
  json_content?: RichTextContent;
}

interface FormConfig {
  name: string;
  description: string;
  fields: FormField[];
}

interface AssessmentFormProps {
  matterId: string;
  derivedClientType: 'individual' | 'corporate';
  entityType: string;
  individualFormConfig: FormConfig;
  corporateFormConfig: FormConfig;
  initialValues?: FormAnswers;
  readOnlyFields?: string[];
}

/**
 * Map entity type to the appropriate officer title.
 * Uses case-insensitive matching — stored values may have inconsistent casing.
 */
function getOfficerTitle(entityType: string): string {
  const lower = entityType.toLowerCase();
  if (lower === 'llp') return 'members';
  if (lower === 'partnership') return 'partners';
  if (lower === 'trustee(s) of a trust') return 'trustees';
  // All company types (limited by shares, guarantee, PLC)
  return 'directors';
}

/**
 * Format a number string with £ and commas.
 * Strips non-numeric chars, adds commas, prepends £.
 */
function formatCurrency(raw: string): string {
  // Remove everything except digits
  const digits = raw.replace(/[^\d]/g, '');
  if (digits === '') return '';
  // Add commas
  const formatted = Number(digits).toLocaleString('en-GB');
  return `\u00A3${formatted}`;
}

/**
 * Strip currency formatting to get raw digits for storage.
 */
function stripCurrency(formatted: string): string {
  return formatted.replace(/[^\d]/g, '');
}

export function AssessmentForm({
  matterId,
  derivedClientType,
  entityType,
  individualFormConfig,
  corporateFormConfig,
  initialValues = {},
  readOnlyFields = [],
}: AssessmentFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<FormAnswers>(() => ({ ...initialValues }));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Currency field ID differs by form type: 38 (corporate), 26 (individual)
  const currencyFieldId = derivedClientType === 'corporate' ? '38' : '26';
  const [currencyDisplay, setCurrencyDisplay] = useState<string>(() => {
    const raw = initialValues[currencyFieldId];
    if (typeof raw === 'string' && raw) return formatCurrency(raw);
    return '';
  });

  const formConfig =
    derivedClientType === 'individual'
      ? individualFormConfig
      : corporateFormConfig;

  const fieldMap = useMemo(() => {
    const map = new Map<string, FormField>();
    for (const field of formConfig.fields) {
      map.set(field.id, field);
    }
    return map;
  }, [formConfig.fields]);

  const readOnlySet = useMemo(() => new Set(readOnlyFields), [readOnlyFields]);
  const officerTitle = useMemo(() => getOfficerTitle(entityType), [entityType]);

  // Build reverse map: gate field ID → list of dependent field IDs
  // Used to clear stale answers when a gate field changes value
  const dependentFieldMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const field of formConfig.fields) {
      if (field.show_if) {
        for (const gateFieldId of Object.keys(field.show_if)) {
          const deps = map.get(gateFieldId) || [];
          deps.push(field.id);
          map.set(gateFieldId, deps);
        }
      }
    }
    return map;
  }, [formConfig.fields]);

  const shouldShowField = useCallback(
    (field: FormField): boolean => {
      if (!field.show_if) return true;
      for (const [fieldId, requiredValue] of Object.entries(field.show_if)) {
        const currentValue = answers[fieldId];
        if (currentValue !== requiredValue) {
          return false;
        }
      }
      return true;
    },
    [answers]
  );

  const setAnswer = useCallback((fieldId: string, value: string | string[]) => {
    setAnswers((prev) => {
      const next = { ...prev, [fieldId]: value };
      // Clear answers for dependent fields when a gate field changes
      const dependents = dependentFieldMap.get(fieldId);
      if (dependents) {
        for (const depId of dependents) {
          delete next[depId];
        }
      }
      return next;
    });
    // Also clear currency display if the gate field hides the currency field
    const dependents = dependentFieldMap.get(fieldId);
    if (dependents?.includes(currencyFieldId)) {
      setCurrencyDisplay('');
    }
  }, [dependentFieldMap, currencyFieldId]);

  const toggleCheckbox = useCallback((fieldId: string, option: string) => {
    setAnswers((prev) => {
      const current = prev[fieldId];
      const currentArray = Array.isArray(current) ? current : [];
      const newArray = currentArray.includes(option)
        ? currentArray.filter((v) => v !== option)
        : [...currentArray, option];
      return { ...prev, [fieldId]: newArray };
    });
  }, []);

  /**
   * Get label text, with dynamic substitution for entity-type-aware fields.
   */
  const getLabelText = useCallback((field: FormField): string => {
    if (!field.label) return '';
    const raw = typeof field.label === 'string' ? field.label : field.label.value;

    // Dynamic wording for ownership/control fields (corporate form only)
    if (derivedClientType === 'corporate') {
      if (field.id === '20') {
        return `Number of ${officerTitle}`;
      }
      if (field.id === '22') {
        return `In what countries are the ${officerTitle} resident?`;
      }
    }
    return raw;
  }, [derivedClientType, officerTitle]);

  const getOptions = (field: FormField): string[] => {
    if (!field.label || typeof field.label === 'string') return [];
    return field.label.options || [];
  };

  const isRequired = (field: FormField): boolean => {
    return field.validation?.includes('required') ?? false;
  };

  const isReadOnly = useCallback((fieldId: string): boolean => {
    return readOnlySet.has(fieldId);
  }, [readOnlySet]);

  const getRichTextContent = (field: FormField): string => {
    if (!field.json_content?.content) return '';
    return field.json_content.content
      .map(
        (block) =>
          block.content?.map((inline) => inline.text || '').join('') || ''
      )
      .join('\n');
  };

  const renderFieldLabel = (field: FormField, fieldReadOnly: boolean) => {
    return (
      <div className={styles.fieldLabelRow}>
        <label className={styles.fieldLabel}>
          {getLabelText(field)}
          {isRequired(field) && <span className={styles.fieldRequired}>*</span>}
          {fieldReadOnly && <span className={styles.prefilledBadge}>Pre-filled</span>}
        </label>
        <QuestionHelperButton questionId={field.id} questionText={getLabelText(field)} />
      </div>
    );
  };

  const renderField = (field: FormField): React.ReactNode => {
    if (!shouldShowField(field)) return null;

    switch (field.type) {
      case 'section':
        return renderSection(field);
      case 'text':
        // Currency formatting for expected value field (38=corporate, 26=individual)
        if (field.id === currencyFieldId) {
          return renderCurrencyField(field);
        }
        return renderTextField(field);
      case 'date':
        return renderDateField(field);
      case 'country_multi':
        return renderCountryMultiField(field);
      case 'radio':
        return renderRadioField(field);
      case 'checkbox':
        return renderCheckboxField(field);
      case 'rich_text':
        return renderRichText(field);
      default:
        return null;
    }
  };

  const renderSection = (field: FormField): React.ReactNode => {
    if (!field.fields || field.fields.length === 0) return null;

    const childFields = field.fields
      .map((id) => fieldMap.get(id))
      .filter((f): f is FormField => f !== undefined);

    const isTopLevel = childFields.some((f) => f.type === 'section');

    if (isTopLevel) {
      return <div key={field.id}>{childFields.map(renderField)}</div>;
    }

    return (
      <div key={field.id} className={styles.formSection}>
        {field.label && (
          <h2 className={styles.formSectionTitle}>
            {field.label as string}
          </h2>
        )}
        {childFields.map(renderField)}
      </div>
    );
  };

  const renderTextField = (field: FormField): React.ReactNode => {
    const value = (answers[field.id] as string) || '';
    const fieldReadOnly = isReadOnly(field.id);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, fieldReadOnly)}
        <input
          type="text"
          className={`${styles.input} ${fieldReadOnly ? styles.inputReadOnly : ''}`}
          value={value}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          readOnly={fieldReadOnly}
          tabIndex={fieldReadOnly ? -1 : undefined}
        />
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderDateField = (field: FormField): React.ReactNode => {
    const value = (answers[field.id] as string) || '';
    const fieldReadOnly = isReadOnly(field.id);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, fieldReadOnly)}
        <input
          type="date"
          className={`${styles.input} ${fieldReadOnly ? styles.inputReadOnly : ''}`}
          value={value}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          readOnly={fieldReadOnly}
          tabIndex={fieldReadOnly ? -1 : undefined}
        />
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderCountryMultiField = (field: FormField): React.ReactNode => {
    const value = (answers[field.id] as string) || '';
    const fieldReadOnly = isReadOnly(field.id);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, fieldReadOnly)}
        <CountryMultiSelect
          value={value}
          onChange={(v) => setAnswer(field.id, v)}
          readOnly={fieldReadOnly}
        />
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderCurrencyField = (field: FormField): React.ReactNode => {
    const fieldReadOnly = isReadOnly(field.id);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, fieldReadOnly)}
        <input
          type="text"
          inputMode="numeric"
          className={`${styles.input} ${fieldReadOnly ? styles.inputReadOnly : ''}`}
          value={currencyDisplay}
          onChange={(e) => {
            const raw = stripCurrency(e.target.value);
            const formatted = formatCurrency(raw);
            setCurrencyDisplay(formatted);
            // Store raw numeric value in answers
            setAnswer(field.id, raw);
          }}
          readOnly={fieldReadOnly}
          tabIndex={fieldReadOnly ? -1 : undefined}
          placeholder="Enter amount"
        />
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderRadioField = (field: FormField): React.ReactNode => {
    const selectedValue = (answers[field.id] as string) || '';
    const options = getOptions(field);
    const fieldReadOnly = isReadOnly(field.id);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, fieldReadOnly)}
        <div className={styles.radioGroup}>
          {options.map((option) => (
            <label
              key={option}
              className={`${styles.radioOption} ${fieldReadOnly ? styles.radioOptionReadOnly : ''}`}
            >
              <input
                type="radio"
                name={field.id}
                value={option}
                checked={selectedValue === option}
                onChange={() => {
                  if (!fieldReadOnly) setAnswer(field.id, option);
                }}
                disabled={fieldReadOnly}
              />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderCheckboxField = (field: FormField): React.ReactNode => {
    const selectedValues = Array.isArray(answers[field.id])
      ? (answers[field.id] as string[])
      : [];
    const options = getOptions(field);

    return (
      <div key={field.id} className={styles.field}>
        {renderFieldLabel(field, false)}
        <div className={styles.checkboxGroup}>
          {options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                onChange={() => toggleCheckbox(field.id, option)}
              />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderRichText = (field: FormField): React.ReactNode => {
    const content = getRichTextContent(field);
    if (!content) return null;
    return <div key={field.id} className={styles.richText}>{content}</div>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitAssessment({
        matter_id: matterId,
        form_answers: answers,
      });

      if (result.success) {
        router.push(`/assessments/${result.assessment.id}`);
      } else {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rootField = formConfig.fields.find(
    (f) =>
      f.type === 'section' &&
      f.fields?.some((id) => fieldMap.get(id)?.type === 'section')
  );

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}
      {rootField && renderField(rootField)}

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => router.push(`/matters/${matterId}`)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
