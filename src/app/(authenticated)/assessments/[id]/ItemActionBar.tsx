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
  onManualIdv: (actionId: string, data: {
    photoIdType: string;
    proofOfAddressType: string;
    proofOfAddressDate: string;
    verificationDate: string;
    notes?: string;
  }) => void;
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
  onManualIdv,
  linkRecordId,
  setLinkRecordId,
  openLinkAmiqus,
  setOpenLinkAmiqus,
}: ItemActionBarProps) {
  const [openUpload, setOpenUpload] = useState(false);
  const [openManual, setOpenManual] = useState(false);
  const [openFormState, setOpenFormState] = useState(false);
  const [openIdvForm, setOpenIdvForm] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [verifiedAt, setVerifiedAt] = useState('');
  const [idvPhotoIdType, setIdvPhotoIdType] = useState('');
  const [idvPoaType, setIdvPoaType] = useState('');
  const [idvPoaDate, setIdvPoaDate] = useState('');
  const [idvVerificationDate, setIdvVerificationDate] = useState('');
  const [idvNotes, setIdvNotes] = useState('');

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
            {showAmiqus && (
              <button
                type="button"
                className={styles.chLookupButton}
                onClick={() => {
                  setOpenIdvForm(!openIdvForm);
                  setOpenUpload(false);
                  setOpenManual(false);
                }}
                disabled={isPending}
              >
                {openIdvForm ? 'Cancel' : 'Record Manual Verification'}
              </button>
            )}
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => {
                setOpenUpload(!openUpload);
                setOpenManual(false);
                setOpenIdvForm(false);
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
                setOpenIdvForm(false);
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
              The case number from your Amiqus URL (e.g. id.amiqus.co/cases/<strong>39229</strong>).
            </p>
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Linking...' : 'Link Record'}
          </button>
        </form>
      )}

      {/* Inline manual identity verification form */}
      {openIdvForm && showAmiqus && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onManualIdv(action.actionId, {
              photoIdType: idvPhotoIdType,
              proofOfAddressType: idvPoaType,
              proofOfAddressDate: idvPoaDate,
              verificationDate: idvVerificationDate,
              notes: idvNotes || undefined,
            });
            setOpenIdvForm(false);
            setIdvPhotoIdType('');
            setIdvPoaType('');
            setIdvPoaDate('');
            setIdvVerificationDate('');
            setIdvNotes('');
          }}
          className={styles.evidenceForm}
        >
          <div className={styles.formField}>
            <label className={styles.formLabel}>Photo ID type</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.25rem' }}>
              {['Valid passport', 'UK Photocard driving licence'].map((opt) => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`idv-photo-id-${action.actionId}`}
                    value={opt}
                    checked={idvPhotoIdType === opt}
                    onChange={(e) => setIdvPhotoIdType(e.target.value)}
                    required
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Proof of address type</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.25rem' }}>
              {['Utility bill', 'Bank statement', 'Building society statement', 'Council tax statement'].map((opt) => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`idv-poa-type-${action.actionId}`}
                    value={opt}
                    checked={idvPoaType === opt}
                    onChange={(e) => setIdvPoaType(e.target.value)}
                    required
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formField}>
            <label htmlFor={`idv-poa-date-${action.actionId}`} className={styles.formLabel}>
              Date on proof of address document
            </label>
            <input
              id={`idv-poa-date-${action.actionId}`}
              type="date"
              value={idvPoaDate}
              onChange={(e) => setIdvPoaDate(e.target.value)}
              required
              className={styles.formInput}
            />
            <p className={styles.formHint}>Must be dated within the last 3 months.</p>
          </div>

          <div className={styles.formField}>
            <label htmlFor={`idv-verification-date-${action.actionId}`} className={styles.formLabel}>
              Date you verified the documents
            </label>
            <input
              id={`idv-verification-date-${action.actionId}`}
              type="date"
              value={idvVerificationDate}
              onChange={(e) => setIdvVerificationDate(e.target.value)}
              required
              className={styles.formInput}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor={`idv-notes-${action.actionId}`} className={styles.formLabel}>
              Notes (optional)
            </label>
            <textarea
              id={`idv-notes-${action.actionId}`}
              value={idvNotes}
              onChange={(e) => setIdvNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about the verification..."
              className={styles.formTextarea}
            />
          </div>

          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Recording...' : 'Record Verification'}
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
