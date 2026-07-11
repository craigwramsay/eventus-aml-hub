/**
 * Render a CMLRA form JSON as a static, printable blank template.
 *
 * Deliberate design choices:
 *   - Ignores `show_if` — every conditional question is displayed, so an
 *     inspector sees the whole universe of questions the firm might ask.
 *     Conditionally-shown fields are marked with a small badge so the logic
 *     is still visible.
 *   - Options are rendered as unfilled radio circles / checkbox squares so
 *     the printed sheet reads as a paper form.
 *   - Non-interactive: no <input> elements, no client-side state. Everything
 *     is a React server-friendly render of the FormConfig.
 */

import type { FormConfig, FormField, FormFieldOption } from '@/lib/rules-engine/types';
import styles from './blank-template.module.css';

interface RichTextField extends FormField {
  json_content?: {
    content?: Array<{
      content?: Array<{ text?: string }>;
    }>;
  };
}

interface BlankFormRendererProps {
  form: FormConfig;
  /** Section id whose children are treated as the top-level sections (defaults to id "1"). */
  rootId?: string;
}

export function BlankFormRenderer({ form, rootId = '1' }: BlankFormRendererProps) {
  const byId = new Map<string, FormField>();
  for (const field of form.fields) byId.set(field.id, field);
  const root = byId.get(rootId);
  if (!root || !Array.isArray(root.fields)) {
    return <p className={styles.error}>Blank template unavailable: form root not found.</p>;
  }
  return (
    <div className={styles.form}>
      {root.fields.map((childId, i) => (
        <SectionBlock
          key={childId}
          field={byId.get(childId)}
          byId={byId}
          sectionNumber={i + 1}
        />
      ))}
    </div>
  );
}

function SectionBlock(props: {
  field: FormField | undefined;
  byId: Map<string, FormField>;
  sectionNumber: number;
}) {
  const { field, byId } = props;
  if (!field) return null;
  const label = typeof field.label === 'string' ? field.label : null;
  const children = Array.isArray(field.fields) ? field.fields : [];
  return (
    <section className={styles.section}>
      {label && <h3 className={styles.sectionTitle}>{label}</h3>}
      <ol className={styles.questionList}>
        {children.map((childId) => (
          <li key={childId} className={styles.questionItem}>
            <QuestionBlock field={byId.get(childId)} byId={byId} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function QuestionBlock({ field, byId }: { field: FormField | undefined; byId: Map<string, FormField> }) {
  if (!field) return null;

  if (field.type === 'rich_text') {
    return <RichTextBlock field={field as RichTextField} />;
  }

  if (field.type === 'section') {
    // Rare: nested subsection. Render inline heading + children.
    const label = typeof field.label === 'string' ? field.label : null;
    const children = Array.isArray(field.fields) ? field.fields : [];
    return (
      <div className={styles.subsection}>
        {label && <h4 className={styles.subsectionTitle}>{label}</h4>}
        <ol className={styles.questionList}>
          {children.map((childId) => (
            <li key={childId} className={styles.questionItem}>
              <QuestionBlock field={byId.get(childId)} byId={byId} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const label = typeof field.label === 'string'
    ? field.label
    : field.label?.value ?? '';
  const options = typeof field.label === 'object' ? field.label?.options : undefined;
  const required = field.validation?.includes('required');
  const conditional = field.show_if && Object.keys(field.show_if).length > 0;

  return (
    <div className={styles.question}>
      <div className={styles.questionHeader}>
        <span className={styles.questionLabel}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </span>
        <span className={styles.metaChips}>
          {conditional && (
            <span className={styles.chipConditional} title={formatConditionTooltip(field.show_if!)}>
              Conditional
            </span>
          )}
        </span>
      </div>

      {field.hint && <p className={styles.hint}>{field.hint}</p>}

      <div className={styles.answerArea}>
        <AnswerControl type={field.type} options={options} />
      </div>
    </div>
  );
}

function AnswerControl({ type, options }: { type: string; options?: string[] }) {
  switch (type) {
    case 'text':
      return <div className={styles.textLine} aria-label="Answer space" />;
    case 'date':
      return <div className={styles.dateBoxes}>DD / MM / YYYY</div>;
    case 'country_multi':
      return <div className={styles.countryBox}>Countries:</div>;
    case 'radio':
      return (
        <ul className={styles.optionList}>
          {(options ?? []).map((opt, i) => (
            <li key={i} className={styles.optionItem}>
              <span className={styles.radioCircle} aria-hidden />
              <span>{opt}</span>
            </li>
          ))}
        </ul>
      );
    case 'checkbox':
      return (
        <ul className={styles.optionList}>
          {(options ?? []).map((opt, i) => (
            <li key={i} className={styles.optionItem}>
              <span className={styles.checkSquare} aria-hidden />
              <span>{opt}</span>
            </li>
          ))}
        </ul>
      );
    case 'select':
      return (
        <ul className={styles.optionList}>
          {(options ?? []).map((opt, i) => (
            <li key={i} className={styles.optionItem}>
              <span className={styles.radioCircle} aria-hidden />
              <span>{opt}</span>
            </li>
          ))}
        </ul>
      );
    default:
      return <div className={styles.textLine} aria-label="Answer space" />;
  }
}

function RichTextBlock({ field }: { field: RichTextField }) {
  const doc = field.json_content;
  if (!doc?.content) return null;
  const paragraphs = doc.content.map((block, i) => {
    const text = block.content?.map((inline) => inline.text ?? '').join('') ?? '';
    if (!text) return null;
    return (
      <p key={i} className={styles.instruction}>
        {text}
      </p>
    );
  });
  return <div className={styles.instructionBlock}>{paragraphs}</div>;
}

function formatConditionTooltip(showIf: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [fieldId, val] of Object.entries(showIf)) {
    const arr = Array.isArray(val) ? val.join(' / ') : val;
    parts.push(`Q${fieldId} = ${arr}`);
  }
  return `Shown when: ${parts.join(' AND ')}`;
}

// Consume the FormFieldOption type (this file drives the field.label variant discrimination).
// Referenced here so tsc knows it's not a dead import when strict flags are on.
export type { FormFieldOption };
