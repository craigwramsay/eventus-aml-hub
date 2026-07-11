/**
 * Blank Risk Assessment Templates
 *
 * Renders the firm's CMLRA forms (Individual and Non-individual/Corporate)
 * as printable blank templates — for producing on demand to inspectors
 * (Law Society, MLRO audits, etc.). No client data, no per-matter context.
 *
 * Gated to admin / MLRO / platform_admin.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserProfile, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/roles';
import type { FormConfig } from '@/lib/rules-engine/types';
import { BlankTemplateView } from './BlankTemplateView';
import individualFormRaw from '@/config/eventus/forms/CMLRA_individual.json';
import corporateFormRaw from '@/config/eventus/forms/CMLRA_corporate.json';
import styles from './blank-template.module.css';

const individualForm = individualFormRaw as unknown as FormConfig;
const corporateForm = corporateFormRaw as unknown as FormConfig;

function canAccess(role: UserRole): boolean {
  return role === 'admin' || role === 'mlro' || role === 'platform_admin';
}

export default async function BlankAssessmentTemplatePage() {
  const profile = await getUserProfile();
  if (!profile) redirect('/login');
  if (!canAccess(profile.role as UserRole)) {
    return (
      <div className={styles.error}>
        <p>You don&apos;t have access to this page. Available to Administrators and MLROs only.</p>
        <Link href="/assessments">Return to assessments</Link>
      </div>
    );
  }

  // Firm name for the printed header. Best-effort — falls back to a generic
  // label if the row is missing.
  const supabase = await createClient();
  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', profile.firm_id)
    .single();
  const firmName = firm?.name ?? null;

  return (
    <BlankTemplateView
      firmName={firmName}
      individualForm={individualForm}
      corporateForm={corporateForm}
    />
  );
}
