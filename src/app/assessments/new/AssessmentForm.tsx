'use client';

/**
 * Assessment Form Component
 * Renders dynamic CMLRA form based on config and submits via deterministic engine
 * Client type is strictly derived from matter → no override permitted.
 */

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitAssessment } from '@/app/actions/assessments';
import type { ClientType, FormAnswers } from '@/lib/rules-engine/types';
import styles from './page.module.css';

// Types for form config
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
  clientName: string;
  derivedClientType: 'individual' | 'corporate';
  individualFormConfig: FormConfig;
  corporateFormConfig: FormConfig;
}

export function AssessmentForm({
  matterId,
  derivedClientType,
  individualFormConfig,
  corporateFormConfig,
}: AssessmentFormProps) {
  const router = useRouter();

  // Client type is strictly derived — no override allowed
  const clientType: ClientType = derivedClientType;

  const [answers, setAnswers] = useState<FormAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formConfig =
    clientType === 'individual'
      ? individualFormConfig
      : corporateFormConfig;

  const fieldMap = useMemo(() => {
    const map = new Map<string, FormField>();
    for (const field of formConfig.fields) {
      map.set(field.id, field);
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
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

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

  const getLabelText = (field: FormField): string => {
    if (!field.label) return '';
    if (typeof field.label === 'string') return field.label;
    return field.label.value;
  };

  const getOptions = (field: FormField): string[] => {
    if (!field.label || typeof field.label === 'string') return [];
    return field.label.options || [];
  };

  const isRequired = (field: FormField): boolean => {
    return field.validation?.includes('required') ?? false;
  };

  const getRichTextContent = (field: FormField): string => {
    if (!field.json_content?.content) return '';
    return field.json_content.content
      .map(
        (block) =>
          block.content
            ?.map((inline) => inline.text || '')
            .join('') || ''
      )
      .join('\n');
  };

  const renderField = (field: FormField): React.ReactNode => {
    if (!shouldShowField(field)) return null;

    switch (field.type) {
      case 'section':
        return renderSection(field);
      case 'text':
        return renderTextField(field);
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
      return (
        <div key={field.id}>
          {childFields.map((childField) => renderField(childField))}
        </div>
      );
    }

    return (
      <div key={field.id} className={styles.formSection}>
        {field.label && (
          <h2 className={styles.formSectionTitle}>
            {field.label as string}
          </h2>
        )}
        {childFields.map((childField) => renderField(childField))}
      </div>
    );
  };

  const renderTextField = (field: FormField): React.ReactNode => {
    const labelText = getLabelText(field);
    const value = (answers[field.id] as string) || '';

    return (
      <div key={field.id} className={styles.field}>
        <label className={styles.fieldLabel}>
          {labelText}
          {isRequired(field) && (
            <span className={styles.fieldRequired}>*</span>
          )}
        </label>
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          required={isRequired(field)}
        />
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderRadioField = (field: FormField): React.ReactNode => {
    const labelText = getLabelText(field);
    const options = getOptions(field);
    const selectedValue = (answers[field.id] as string) || '';

    return (
      <div key={field.id} className={styles.field}>
        <label className={styles.fieldLabel}>
          {labelText}
          {isRequired(field) && (
            <span className={styles.fieldRequired}>*</span>
          )}
        </label>
        <div className={styles.radioGroup}>
          {options.map((option) => (
            <label
              key={option}
              className={`${styles.radioOption} ${
                selectedValue === option ? styles.selected : ''
              }`}
            >
              <input
                type="radio"
                className={styles.radioInput}
                name={field.id}
                value={option}
                checked={selectedValue === option}
                onChange={() => setAnswer(field.id, option)}
              />
              <span className={styles.radioLabel}>{option}</span>
            </label>
          ))}
        </div>
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderCheckboxField = (field: FormField): React.ReactNode => {
    const labelText = getLabelText(field);
    const options = getOptions(field);
    const selectedValues = Array.isArray(answers[field.id])
      ? (answers[field.id] as string[])
      : [];

    return (
      <div key={field.id} className={styles.field}>
        <label className={styles.fieldLabel}>
          {labelText}
          {isRequired(field) && (
            <span className={styles.fieldRequired}>*</span>
          )}
        </label>
        <div className={styles.checkboxGroup}>
          {options.map((option) => (
            <label
              key={option}
              className={`${styles.checkboxOption} ${
                selectedValues.includes(option)
                  ? styles.selected
                  : ''
              }`}
            >
              <input
                type="checkbox"
                className={styles.checkboxInput}
                checked={selectedValues.includes(option)}
                onChange={() => toggleCheckbox(field.id, option)}
              />
              <span className={styles.checkboxLabel}>
                {option}
              </span>
            </label>
          ))}
        </div>
        {field.hint && (
          <div className={styles.fieldHint}>{field.hint}</div>
        )}
      </div>
    );
  };

  const renderRichText = (field: FormField): React.ReactNode => {
    const content = getRichTextContent(field);
    if (!content) return null;

    return (
      <div key={field.id} className={styles.richText}>
        {content}
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitAssessment({
        matter_id: matterId,
        client_type: clientType,
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
      f.fields?.some((id) => {
        const child = fieldMap.get(id);
        return child?.type === 'section';
      })
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
