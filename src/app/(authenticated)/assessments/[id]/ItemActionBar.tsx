'use client';

import { useState } from 'react';
import type { MandatoryAction } from '@/lib/rules-engine/types';
import type { AssessmentEvidence, AmiqusVerification } from '@/lib/supabase/types';
import { getSowSofFormConfig } from '@/lib/rules-engine/config-loader';
import { SowSofForm } from './SowSofForm';
import styles from './page.module.css';

interface ItemActionBarProps {
  action: MandatoryAction;
  assessmentId: string;
  isPending: boolean;
  isFinalised: boolean;
  isCorporate: boolean;
  registeredNumber: string | null;
  isCompleted: boolean;
  showCH: boolean;
  showAmiqus: boolean;
  showForm: boolean;
  showApproval: boolean;
  showConfirm: boolean;
  showDocumentConfirm: boolean;
  amiqusConfigured: boolean;
  clientEmail: string;
  itemEvidence: AssessmentEvidence[];
  verification: AmiqusVerification | undefined;
  priorSowData?: Record<string, string | string[]> | null;
  // Handlers
  onCHLookup: (actionId: string) => void;
  onToggle: (actionId: string, isCompleted: boolean) => void;
  onDocumentConfirm: (actionId: string) => void;
  onInitiateAmiqus: (actionId: string) => void;
  onLinkAmiqus: (actionId: string, e: React.FormEvent<HTMLFormElement>) => void;
  onFileUpload: (actionId: string, e: React.FormEvent<HTMLFormElement>) => void;
  onManualRecord: (actionId: string, notes: string, verifiedAt: string | null) => void;
  // State for link Amiqus form
  linkRecordId: string;
  setLinkRecordId: (v: string) => void;
  openLinkAmiqus: string | null;
  setOpenLinkAmiqus: (v: string | null) => void;
}

export function ItemActionBar({
  action,
  assessmentId,
  isPending,
  isFinalised,
  isCorporate,
  registeredNumber,
  isCompleted,
  showCH,
  showAmiqus,
  showForm,
  showApproval,
  showConfirm,
  showDocumentConfirm,
  amiqusConfigured,
  clientEmail,
  itemEvidence,
  verification,
  priorSowData,
  onCHLookup,
  onToggle,
  onDocumentConfirm,
  onInitiateAmiqus,
  onLinkAmiqus,
  onFileUpload,
  onManualRecord,
  linkRecordId,
  setLinkRecordId,
  openLinkAmiqus,
  setOpenLinkAmiqus,
}: ItemActionBarProps) {
  const [openUpload, setOpenUpload] = useState(false);
  const [openManual, setOpenManual] = useState(false);
  const [openFormState, setOpenFormState] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [verifiedAt, setVerifiedAt] = useState('');

  if (isFinalised) return null;

  const showLinkAmiqus = openLinkAmiqus === action.actionId;

  return (
    <>
      <div className={styles.itemActionsBar}>
        {showCH && (
          <button
            type="button"
            className={styles.chLookupButton}
            onClick={() => onCHLookup(action.actionId)}
            disabled={isPending}
          >
            {isPending ? 'Looking up...' : 'Verify at Companies House'}
          </button>
        )}

        {showAmiqus && (() => {
          if (!verification && amiqusConfigured) {
            return (
              <>
                <button
                  type="button"
                  className={styles.amiqusLinkButton}
                  onClick={() => onInitiateAmiqus(action.actionId)}
                  disabled={isPending || !clientEmail}
                >
                  {isPending ? 'Initiating...' : 'Initiate Amiqus Verification'}
                </button>
                <button
                  type="button"
                  className={styles.evidenceActionButton}
                  onClick={() => {
                    setOpenLinkAmiqus(showLinkAmiqus ? null : action.actionId);
                    setOpenUpload(false);
                    setOpenManual(false);
                  }}
                  disabled={isPending}
                >
                  {showLinkAmiqus ? 'Cancel' : 'Link Existing Record'}
                </button>
              </>
            );
          }
          if ((verification?.status === 'failed' || verification?.status === 'expired') && amiqusConfigured) {
            return (
              <button
                type="button"
                className={styles.amiqusLinkButton}
                onClick={() => onInitiateAmiqus(action.actionId)}
                disabled={isPending || !clientEmail}
              >
                Retry Verification
              </button>
            );
          }
          if (!verification && !amiqusConfigured) {
            return (
              <a
                href="https://id.amiqus.co/"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.amiqusLinkButton}
              >
                Verify via Amiqus
              </a>
            );
          }
          return null;
        })()}

        {showForm && (
          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={() => {
              setOpenFormState(!openFormState);
              setOpenUpload(false);
              setOpenManual(false);
            }}
            disabled={isPending}
          >
            {openFormState ? 'Close Form' : 'Open Form'}
          </button>
        )}

        {showDocumentConfirm ? (
          <>
            {isCorporate && registeredNumber && (
              <a
                href={`https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(registeredNumber)}/filing-history`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.evidenceActionButton}
              >
                View Filing History (Companies House)
              </a>
            )}
            <button
              type="button"
              className={isCompleted ? styles.evidenceActionButton : styles.formSubmit}
              onClick={() => onDocumentConfirm(action.actionId)}
              disabled={isPending || isCompleted}
            >
              {isCompleted ? 'Saved to compliance folder' : 'Saved to matter compliance folder'}
            </button>
          </>
        ) : showConfirm ? (
          <button
            type="button"
            className={isCompleted ? styles.evidenceActionButton : styles.formSubmit}
            onClick={() => onToggle(action.actionId, isCompleted)}
            disabled={isPending || isCompleted}
          >
            {isCompleted ? 'Confirmed' : 'Confirm'}
          </button>
        ) : !showApproval && (
          <>
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => {
                setOpenUpload(!openUpload);
                setOpenManual(false);
              }}
              disabled={isPending}
            >
              {openUpload ? 'Cancel' : 'Upload Evidence'}
            </button>
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => {
                setOpenManual(!openManual);
                setOpenUpload(false);
              }}
              disabled={isPending}
            >
              {openManual ? 'Cancel' : 'Add File Note'}
            </button>
          </>
        )}
      </div>

      {/* Inline upload form */}
      {openUpload && (
        <form
          onSubmit={(e) => {
            onFileUpload(action.actionId, e);
            setOpenUpload(false);
          }}
          className={styles.evidenceForm}
        >
          <div className={styles.formField}>
            <label htmlFor={`file-${action.actionId}`} className={styles.formLabel}>File</label>
            <input id={`file-${action.actionId}`} type="file" name="file" required className={styles.formInput} />
          </div>
          {showAmiqus && (
            <div className={styles.formField}>
              <label htmlFor={`verified-at-upload-${action.actionId}`} className={styles.formLabel}>
                Date of verification
              </label>
              <input
                id={`verified-at-upload-${action.actionId}`}
                type="date"
                name="verified_at"
                className={styles.formInput}
              />
            </div>
          )}
          <div className={styles.formField}>
            <label htmlFor={`notes-${action.actionId}`} className={styles.formLabel}>Notes (optional)</label>
            <textarea id={`notes-${action.actionId}`} name="notes" rows={2} className={styles.formTextarea} />
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {/* Inline file note form */}
      {openManual && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onManualRecord(action.actionId, manualNotes, showAmiqus ? (verifiedAt || null) : null);
            setManualNotes('');
            setVerifiedAt('');
            setOpenManual(false);
          }}
          className={styles.evidenceForm}
        >
          {showAmiqus && (
            <div className={styles.formField}>
              <label htmlFor={`verified-at-manual-${action.actionId}`} className={styles.formLabel}>
                Date of verification
              </label>
              <input
                id={`verified-at-manual-${action.actionId}`}
                type="date"
                value={verifiedAt}
                onChange={(e) => setVerifiedAt(e.target.value)}
                className={styles.formInput}
              />
            </div>
          )}
          <div className={styles.formField}>
            <label htmlFor={`manual-notes-${action.actionId}`} className={styles.formLabel}>File Note</label>
            <textarea
              id={`manual-notes-${action.actionId}`}
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              rows={3}
              required
              placeholder="Enter your file note..."
              className={styles.formTextarea}
            />
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Saving...' : 'Save File Note'}
          </button>
        </form>
      )}

      {/* Link existing Amiqus record form */}
      {showLinkAmiqus && (
        <form
          onSubmit={(e) => onLinkAmiqus(action.actionId, e)}
          className={styles.evidenceForm}
        >
          <div className={styles.formField}>
            <label htmlFor={`amiqus-record-id-${action.actionId}`} className={styles.formLabel}>Amiqus ID</label>
            <input
              id={`amiqus-record-id-${action.actionId}`}
              type="number"
              value={linkRecordId}
              onChange={(e) => setLinkRecordId(e.target.value)}
              required
              min="1"
              placeholder="e.g. 45306"
              className={styles.formInput}
            />
            <p className={styles.formHint}>
              The number from your Amiqus URL (e.g. id.amiqus.co/cases/<strong>45306</strong>). Works with both case and record IDs.
            </p>
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Linking...' : 'Link Record'}
          </button>
        </form>
      )}

      {/* Inline SoW/SoF declaration form */}
      {openFormState && showForm && (() => {
        const formType = action.actionId === 'sow_form' ? 'sow' as const : 'sof' as const;
        const clientType = isCorporate ? 'corporate' as const : 'individual' as const;
        const formConfig = getSowSofFormConfig(formType, clientType);
        const existingDeclaration = itemEvidence.find(
          (ev) => ev.evidence_type === (formType === 'sow' ? 'sow_declaration' : 'sof_declaration')
        );
        const existingData = existingDeclaration?.data as Record<string, string | string[]> | null;
        const priorData = formType === 'sow' && !existingData ? priorSowData : null;
        return (
          <SowSofForm
            formType={formType}
            formConfig={formConfig}
            assessmentId={assessmentId}
            existingData={existingData}
            priorData={priorData}
            onClose={() => setOpenFormState(false)}
          />
        );
      })()}
    </>
  );
}
