/**
 * Clio Drive PDF Generator
 *
 * Generates a professional PDF summary of a finalised assessment.
 * Uploaded to Clio Drive's Compliance folder on finalisation.
 *
 * Content order: CDD Requirements (with declaration details) → Assessment Detail → Risk Scoring
 *
 * Uses @react-pdf/renderer for server-side PDF generation (no headless browser needed).
 */

import React from 'react';
import { Document, Page, Text, View, Link, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { SOW_INDIVIDUAL_FIELDS, SOW_CORPORATE_FIELDS, SOF_FIELDS } from './sow-sof-html';

// ── Types ──────────────────────────────────────────────────────────────

interface CddEvidenceItem {
  type: 'amiqus' | 'file' | 'note' | 'declaration' | 'ch' | 'confirmed';
  label: string;
  date?: string | null;
  notes?: string | null;
  url?: string | null;
}

interface CddItemSummary {
  description: string;
  category: string;
  completed: boolean;
  completedDate?: string | null;
  completedBy?: string | null;
  /** Structured evidence items matching the page display */
  evidenceItems: CddEvidenceItem[];
  /** Legacy flat summary (fallback) */
  evidenceSummary: string | null;
  /** Clickable Amiqus URL if applicable */
  amiqusUrl: string | null;
}

interface DeclarationData {
  type: 'sow_declaration' | 'sof_declaration';
  actionId: string | null;
  data: Record<string, string | string[]>;
}

interface RiskFactorSummary {
  factorLabel: string;
  selectedAnswer: string | string[];
  score: number;
  rationale: string;
}

interface AssessmentPdfParams {
  assessmentId: string;
  assessmentReference: string;
  clientName: string;
  matterReference: string;
  riskLevel: string;
  score: number;
  finalisedAt: string;
  hubBaseUrl: string;
  cddItems: CddItemSummary[];
  completedCount: number;
  totalCount: number;
  eddTriggers?: Array<{ description: string }>;
  warnings?: string[];
  /** SoW/SoF declaration form data to show expanded in the PDF */
  declarations?: DeclarationData[];
  /** Risk factor breakdown for the scoring section */
  riskFactors?: RiskFactorSummary[];
  /** Human-readable rationale strings */
  rationale?: string[];
  /** Form questions and answers with scoring and EDD indicators */
  formQuestions?: Array<{ type: 'section' | 'question'; label: string; answer?: string; score?: number; eddTrigger?: boolean }>;
  /** Name of user who created the assessment */
  createdByName?: string | null;
  /** Name of user who finalised the assessment */
  finalisedByName?: string | null;
  /** URL to the Clio compliance folder */
  clioComplianceFolderUrl?: string | null;
}

// ── Field label lookup ─────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...SOW_INDIVIDUAL_FIELDS, ...SOW_CORPORATE_FIELDS, ...SOF_FIELDS].map(f => [f.id, f.label])
);

function getFieldLabel(fieldId: string): string {
  return FIELD_LABELS[fieldId] || FIELD_LABELS[fieldId.toLowerCase()] || fieldId;
}

// ── Styles ─────────────────────────────────────────────────────────────

const RISK_COLOURS: Record<string, { bg: string; text: string }> = {
  LOW: { bg: '#d4edda', text: '#155724' },
  MEDIUM: { bg: '#fff3cd', text: '#856404' },
  HIGH: { bg: '#f8d7da', text: '#721c24' },
};

const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'Customer Due Diligence',
  edd: 'Enhanced Due Diligence',
  sow: 'Source of Wealth',
  sof: 'Source of Funds',
  escalation: 'Escalation',
  monitoring: 'Monitoring',
};

const s = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#333',
  },
  // Header
  header: {
    backgroundColor: '#1a1a2e',
    padding: 20,
    marginBottom: 16,
    borderRadius: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#ccc',
    fontSize: 11,
  },
  // Risk badge
  riskBadgeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  riskBadge: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  riskScore: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  // Details table
  detailsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailsLabel: {
    width: 110,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
  },
  detailsValue: {
    flex: 1,
    color: '#333',
  },
  detailsSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  // Section titles
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a2e',
    marginBottom: 8,
    marginTop: 16,
  },
  sectionTitleFirst: {
    marginTop: 0,
  },
  progressText: {
    fontSize: 9,
    color: '#666',
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#444',
    marginTop: 10,
    marginBottom: 6,
  },
  // CDD 3-column table
  cddTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cddColRequirement: {
    flex: 3,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  cddColEvidence: {
    flex: 5,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  cddColStatus: {
    width: 70,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cddColStatusComplete: {
    backgroundColor: '#dcfce7',
  },
  cddColStatusPending: {
    backgroundColor: '#f1f5f9',
  },
  cddHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#333',
    backgroundColor: '#f1f5f9',
  },
  cddHeaderText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    padding: 4,
  },
  cddDescriptionText: {
    fontSize: 9,
    color: '#333',
  },
  cddEvidenceType: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#6b21a8',
    backgroundColor: '#f3e8ff',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 2,
    marginBottom: 2,
    alignSelf: 'flex-start',
  },
  cddEvidenceTypeAmiqus: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  cddEvidenceTypeCH: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  cddEvidenceTypeDecl: {
    color: '#3730a3',
    backgroundColor: '#e0e7ff',
  },
  cddEvidenceLabel: {
    fontSize: 8.5,
    color: '#333',
  },
  cddEvidenceDate: {
    fontSize: 7.5,
    color: '#64748b',
    marginTop: 1,
  },
  cddEvidenceNotes: {
    fontSize: 8,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 2,
  },
  cddStatusText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  cddStatusDate: {
    fontSize: 7,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
  },
  // Legacy CDD item (kept for compatibility)
  cddItem: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 3,
    borderLeftWidth: 3,
  },
  cddItemCompleted: {
    borderLeftColor: '#28a745',
  },
  cddItemIncomplete: {
    borderLeftColor: '#dee2e6',
  },
  checkmark: {
    width: 16,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  checkmarkGreen: {
    color: '#155724',
  },
  checkmarkGrey: {
    color: '#999',
  },
  cddItemText: {
    flex: 1,
    fontSize: 9.5,
  },
  cddItemDescription: {
    color: '#333',
  },
  cddItemEvidence: {
    color: '#666',
    fontSize: 8.5,
    marginTop: 2,
  },
  amiqusLink: {
    color: '#1a73e8',
    fontSize: 8.5,
    marginTop: 1,
  },
  // Declaration details (shown expanded within CDD section)
  declarationBlock: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#f0f4f8',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#6b7280',
  },
  declarationTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
  },
  declarationFieldRow: {
    marginBottom: 4,
  },
  declarationFieldLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  declarationFieldValue: {
    fontSize: 9,
    color: '#333',
  },
  // EDD triggers
  eddSection: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fff3cd',
    borderLeftWidth: 3,
    borderLeftColor: '#ffc107',
    borderRadius: 3,
  },
  eddTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#856404',
    marginBottom: 6,
  },
  eddItem: {
    fontSize: 9,
    color: '#856404',
    marginBottom: 3,
    paddingLeft: 10,
  },
  // Warnings
  warningSection: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f8d7da',
    borderLeftWidth: 3,
    borderLeftColor: '#dc3545',
    borderRadius: 3,
  },
  warningTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#721c24',
    marginBottom: 6,
  },
  warningItem: {
    fontSize: 9,
    color: '#721c24',
    marginBottom: 3,
    paddingLeft: 10,
  },
  // Risk scoring table
  scoringRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 4,
  },
  scoringHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#333',
    paddingVertical: 4,
  },
  scoringFactor: {
    flex: 3,
    fontSize: 9,
    color: '#333',
  },
  scoringAnswer: {
    flex: 3,
    fontSize: 9,
    color: '#555',
  },
  scoringScore: {
    width: 40,
    fontSize: 9,
    color: '#333',
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
  },
  scoringHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
  },
  // Rationale
  rationaleItem: {
    fontSize: 9,
    color: '#555',
    marginBottom: 3,
    paddingLeft: 10,
  },
  // Questions & Answers
  qaSection: {
    fontSize: 9,
  },
  qaSectionHeader: {
    backgroundColor: '#f1f5f9',
    padding: '4 8',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  qaRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  qaRowScored: {
    backgroundColor: '#fffbeb',
  },
  qaRowEdd: {
    backgroundColor: '#fef2f2',
  },
  qaLabelWrap: {
    flex: 5,
    paddingRight: 6,
  },
  qaLabel: {
    fontSize: 8.5,
    color: '#64748b',
  },
  qaAnswerWrap: {
    flex: 4,
    paddingRight: 4,
  },
  qaAnswer: {
    fontSize: 8.5,
    color: '#333',
    fontFamily: 'Helvetica-Bold',
  },
  qaScore: {
    width: 30,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#b45309',
    textAlign: 'right',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#999',
  },
  hubLink: {
    color: '#1a73e8',
    fontSize: 8,
    textDecoration: 'none',
  },
});

// ── Helpers ────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function capitaliseFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── PDF Component ──────────────────────────────────────────────────────

function AssessmentPdfDocument(params: AssessmentPdfParams) {
  const {
    assessmentReference,
    clientName,
    matterReference,
    riskLevel,
    score,
    finalisedAt,
    hubBaseUrl,
    assessmentId,
    cddItems,
    completedCount,
    totalCount,
    eddTriggers,
    warnings,
    declarations = [],
    riskFactors = [],
    rationale = [],
    formQuestions = [],
    createdByName,
    finalisedByName,
    clioComplianceFolderUrl,
  } = params;

  const riskColour = RISK_COLOURS[riskLevel] || RISK_COLOURS.MEDIUM;
  const hubUrl = `${hubBaseUrl}/assessments/${assessmentId}`;
  const generatedAt = formatShortDate(new Date().toISOString());

  // Group CDD items by category
  const itemsByCategory = new Map<string, CddItemSummary[]>();
  for (const item of cddItems) {
    const list = itemsByCategory.get(item.category) || [];
    list.push(item);
    itemsByCategory.set(item.category, list);
  }

  // Index declarations by action_id for inline display
  const declarationByAction = new Map<string, DeclarationData>();
  for (const decl of declarations) {
    if (decl.actionId) declarationByAction.set(decl.actionId, decl);
  }

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>AML Risk Assessment</Text>
          <Text style={s.headerSubtitle}>{clientName}</Text>
        </View>

        {/* Risk Badge */}
        <View style={s.riskBadgeContainer}>
          <Text style={[s.riskBadge, { backgroundColor: riskColour.bg, color: riskColour.text }]}>
            {riskLevel} RISK
          </Text>
          <Text style={s.riskScore}>Score: {score}</Text>
        </View>

        {/* Assessment Details */}
        <View style={s.detailsSection}>
          <View style={s.detailsRow}>
            <Text style={s.detailsLabel}>Assessment Ref</Text>
            <Text style={s.detailsValue}>{assessmentReference}</Text>
          </View>
          <View style={s.detailsRow}>
            <Text style={s.detailsLabel}>Matter Ref</Text>
            <Text style={s.detailsValue}>{matterReference}</Text>
          </View>
          <View style={s.detailsRow}>
            <Text style={s.detailsLabel}>Finalised</Text>
            <Text style={s.detailsValue}>{formatDate(finalisedAt)}</Text>
          </View>
          {createdByName && (
            <View style={s.detailsRow}>
              <Text style={s.detailsLabel}>Assessment by</Text>
              <Text style={s.detailsValue}>{createdByName}</Text>
            </View>
          )}
          {finalisedByName && (
            <View style={s.detailsRow}>
              <Text style={s.detailsLabel}>Finalised by</Text>
              <Text style={s.detailsValue}>{finalisedByName}</Text>
            </View>
          )}
          {clioComplianceFolderUrl && (
            <View style={[s.detailsRow, { marginTop: 4 }]}>
              <Text style={s.detailsLabel}>Clio</Text>
              <Link src={clioComplianceFolderUrl} style={s.hubLink}>
                View Compliance Folder in Clio
              </Link>
            </View>
          )}
        </View>

        {/* ── SECTION 1: CDD Requirements (3-column table) ── */}
        <View>
          <Text style={[s.sectionTitle, s.sectionTitleFirst]}>CDD Requirements</Text>
          <Text style={s.progressText}>
            {completedCount} of {totalCount} requirements completed
          </Text>

          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <View key={category} wrap={false}>
              <Text style={s.categoryTitle}>
                {CATEGORY_LABELS[category] || category}
              </Text>
              {/* Column headers */}
              <View style={s.cddHeaderRow}>
                <View style={s.cddColRequirement}><Text style={s.cddHeaderText}>Requirement</Text></View>
                <View style={s.cddColEvidence}><Text style={s.cddHeaderText}>Evidence / Response</Text></View>
                <View style={{ width: 70, padding: 4 }}><Text style={[s.cddHeaderText, { textAlign: 'center' }]}>Status</Text></View>
              </View>
              {items.map((item, idx) => (
                <View key={`${category}-${idx}`} style={s.cddTableRow}>
                  {/* Column 1: Requirement */}
                  <View style={s.cddColRequirement}>
                    <Text style={s.cddDescriptionText}>{capitaliseFirst(item.description)}</Text>
                  </View>
                  {/* Column 2: Evidence */}
                  <View style={s.cddColEvidence}>
                    {item.evidenceItems.length > 0 ? (
                      item.evidenceItems.map((ev, evIdx) => (
                        <View key={evIdx} style={{ marginBottom: evIdx < item.evidenceItems.length - 1 ? 4 : 0 }}>
                          {ev.type !== 'confirmed' && (
                            <Text style={[
                              s.cddEvidenceType,
                              ev.type === 'amiqus' ? s.cddEvidenceTypeAmiqus : {},
                              ev.type === 'ch' ? s.cddEvidenceTypeCH : {},
                              ev.type === 'declaration' ? s.cddEvidenceTypeDecl : {},
                            ]}>
                              {ev.type === 'amiqus' ? 'Amiqus' : ev.type === 'ch' ? 'CH' : ev.type === 'declaration' ? 'Declaration' : ev.type === 'file' ? 'File' : 'Note'}
                            </Text>
                          )}
                          <Text style={s.cddEvidenceLabel}>{ev.label}</Text>
                          {ev.date && <Text style={s.cddEvidenceDate}>{ev.date}</Text>}
                          {ev.notes && <Text style={s.cddEvidenceNotes}>{ev.notes}</Text>}
                          {ev.url && <Link src={ev.url} style={s.amiqusLink}>View in Amiqus</Link>}
                        </View>
                      ))
                    ) : (
                      <Text style={[s.cddEvidenceLabel, { fontStyle: 'italic', color: '#94a3b8' }]}>
                        {item.completed ? (item.evidenceSummary || 'Confirmed by user') : 'No evidence yet'}
                      </Text>
                    )}
                  </View>
                  {/* Column 3: Status */}
                  <View style={[s.cddColStatus, item.completed ? s.cddColStatusComplete : s.cddColStatusPending]}>
                    <Text style={[s.cddStatusText, { color: item.completed ? '#166534' : '#94a3b8' }]}>
                      {item.completed ? 'Complete' : 'Pending'}
                    </Text>
                    {item.completedDate && <Text style={s.cddStatusDate}>{item.completedDate}</Text>}
                    {item.completedBy && <Text style={s.cddStatusDate}>{item.completedBy}</Text>}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Declaration details shown expanded after the CDD section */}
        {declarations.length > 0 && declarations.map((decl, idx) => (
          <View key={idx} style={s.declarationBlock} wrap={false}>
            <Text style={s.declarationTitle}>
              {decl.type === 'sow_declaration' ? 'Source of Wealth Declaration' : 'Source of Funds Declaration'}
            </Text>
            {Object.entries(decl.data).map(([fieldId, value]) => (
              <View key={fieldId} style={s.declarationFieldRow}>
                <Text style={s.declarationFieldLabel}>{getFieldLabel(fieldId)}</Text>
                <Text style={s.declarationFieldValue}>
                  {Array.isArray(value) ? value.join(', ') : String(value) || 'Not provided'}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* EDD Triggers */}
        {eddTriggers && eddTriggers.length > 0 && (
          <View style={s.eddSection} wrap={false}>
            <Text style={s.eddTitle}>EDD Triggers</Text>
            {eddTriggers.map((t, i) => (
              <Text key={i} style={s.eddItem}>• {t.description}</Text>
            ))}
          </View>
        )}

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <View style={s.warningSection} wrap={false}>
            <Text style={s.warningTitle}>Warnings</Text>
            {warnings.map((w, i) => (
              <Text key={i} style={s.warningItem}>• {w}</Text>
            ))}
          </View>
        )}

        {/* ── SECTION 2: Risk Assessment Scoring (questions + factors + EDD) ── */}
        {formQuestions.length > 0 && (
          <View style={s.qaSection} break>
            <Text style={s.sectionTitle}>Risk Assessment Scoring</Text>

            {/* Risk summary */}
            <View style={{ flexDirection: 'row', marginBottom: 10, alignItems: 'center', gap: 8 }}>
              <Text style={[s.riskBadge, { backgroundColor: riskColour.bg, color: riskColour.text, fontSize: 10, paddingVertical: 4, paddingHorizontal: 12 }]}>
                {riskLevel} RISK
              </Text>
              <Text style={{ fontSize: 9, color: '#666' }}>Score: {score}</Text>
            </View>

            {/* All questions and answers */}
            {formQuestions.map((q, i) => {
              if (q.type === 'section') {
                return <Text key={i} style={s.qaSectionHeader}>{q.label}</Text>;
              }
              const hasScore = q.score && q.score > 0;
              const hasEdd = q.eddTrigger;
              return (
                <View key={i} style={[s.qaRow, hasScore ? s.qaRowScored : {}, hasEdd ? s.qaRowEdd : {}]}>
                  <View style={s.qaLabelWrap}><Text style={s.qaLabel}>{q.label}</Text></View>
                  <View style={s.qaAnswerWrap}><Text style={s.qaAnswer}>{q.answer || '—'}</Text></View>
                  <Text style={s.qaScore}>
                    {hasScore ? `+${q.score}` : ''}{hasEdd ? (hasScore ? ' EDD' : 'EDD') : ''}
                  </Text>
                </View>
              );
            })}

            {/* Risk factors summary */}
            {riskFactors.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#333', marginBottom: 6 }}>Risk Factors Triggered</Text>
                <View style={s.scoringHeaderRow}>
                  <Text style={[s.scoringFactor, s.scoringHeaderText]}>Factor</Text>
                  <Text style={[s.scoringAnswer, s.scoringHeaderText]}>Answer</Text>
                  <Text style={[s.scoringScore, s.scoringHeaderText]}>Score</Text>
                </View>
                {riskFactors.filter(rf => rf.score > 0).map((rf, i) => (
                  <View key={i} style={s.scoringRow}>
                    <Text style={s.scoringFactor}>{rf.factorLabel}</Text>
                    <Text style={s.scoringAnswer}>
                      {Array.isArray(rf.selectedAnswer) ? rf.selectedAnswer.join(', ') : rf.selectedAnswer}
                    </Text>
                    <Text style={s.scoringScore}>+{rf.score}</Text>
                  </View>
                ))}
                <View style={[s.scoringRow, { borderTopWidth: 2, borderTopColor: '#333' }]}>
                  <Text style={[s.scoringFactor, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
                  <Text style={s.scoringAnswer} />
                  <Text style={s.scoringScore}>{score}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated by Eventus AML Compliance Hub on {generatedAt}
          </Text>
          <Link src={hubUrl} style={s.hubLink}>
            View full assessment in Eventus Hub
          </Link>
        </View>
      </Page>
    </Document>
  );
}

// ── Public API ──────────────────────────────────────────────────────────

export type { AssessmentPdfParams, CddItemSummary, DeclarationData, RiskFactorSummary };

/**
 * Generate a PDF buffer for a finalised assessment.
 * Returns a Buffer suitable for uploading to Clio Drive.
 */
export async function generateAssessmentPdf(params: AssessmentPdfParams): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <AssessmentPdfDocument {...params} />
  );
  return Buffer.from(buffer);
}
