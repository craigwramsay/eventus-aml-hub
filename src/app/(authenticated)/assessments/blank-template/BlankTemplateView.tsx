'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FormConfig } from '@/lib/rules-engine/types';
import { BlankFormRenderer } from './BlankFormRenderer';
import styles from './blank-template.module.css';

type Variant = 'individual' | 'corporate';

interface Props {
  firmName: string | null;
  individualForm: FormConfig;
  corporateForm: FormConfig;
}

export function BlankTemplateView({ firmName, individualForm, corporateForm }: Props) {
  const [variant, setVariant] = useState<Variant>('individual');
  const form = variant === 'individual' ? individualForm : corporateForm;

  const generatedOn = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Blank Risk Assessment Templates</h1>
          <p className={styles.subtitle}>
            Printable blank versions of the CMLRA forms — for producing on demand
            to inspectors. All conditional questions are shown.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/assessments" className={styles.toggleButton}>
            Back to assessments
          </Link>
          <button
            type="button"
            className={styles.printButton}
            onClick={() => window.print()}
          >
            Print this template
          </button>
        </div>
      </div>

      <div className={styles.toggleGroup} role="tablist" aria-label="Template variant">
        <button
          type="button"
          role="tab"
          aria-selected={variant === 'individual'}
          className={`${styles.toggleButton} ${variant === 'individual' ? styles.toggleButtonActive : ''}`}
          onClick={() => setVariant('individual')}
        >
          Individual clients
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={variant === 'corporate'}
          className={`${styles.toggleButton} ${variant === 'corporate' ? styles.toggleButtonActive : ''}`}
          onClick={() => setVariant('corporate')}
        >
          Non-individual clients
        </button>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <h2 className={styles.formTitle}>{form.name}</h2>
          <div className={styles.formMeta}>
            {firmName && <span>{firmName}</span>}
            <span>Generated {generatedOn}</span>
            <span>Blank template — for reference only</span>
          </div>
        </div>

        <BlankFormRenderer form={form} />
      </div>
    </div>
  );
}
