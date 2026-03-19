/**
 * Clio Drive PDF Generator
 *
 * Generates a professional PDF summary of a finalised assessment.
 * Uploaded to Clio Drive's Compliance folder on finalisation.
 *
 * Uses @react-pdf/renderer for server-side PDF generation (no headless browser needed).
 */

import React from 'react';
import { Document, Page, Text, View, Link, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

// ── Types ──────────────────────────────────────────────────────────────

interface CddItemSummary {
  description: string;
  category: string;
  completed: boolean;
  /** Human-readable evidence summary, e.g. "Verified via Amiqus #12345 on 5 Jan 2026" */
  evidenceSummary: string | null;
  /** Clickable Amiqus URL if applicable */
  amiqusUrl: string | null;
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
  // CDD section
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a2e',
    marginBottom: 8,
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
  // CDD item
  cddItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingVertical: 4,
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
  } = params;

  const riskColour = RISK_COLOURS[riskLevel] || RISK_COLOURS.MEDIUM;
  const hubUrl = `${hubBaseUrl}/assessments/${assessmentId}`;
  const generatedAt = formatShortDate(new Date().toISOString());

  // Group items by category
  const itemsByCategory = new Map<string, CddItemSummary[]>();
  for (const item of cddItems) {
    const list = itemsByCategory.get(item.category) || [];
    list.push(item);
    itemsByCategory.set(item.category, list);
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
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
        </View>

        {/* CDD Checklist */}
        <View>
          <Text style={s.sectionTitle}>Compliance Requirements</Text>
          <Text style={s.progressText}>
            {completedCount} of {totalCount} requirements completed
          </Text>

          {Array.from(itemsByCategory.entries()).map(([category, items]) => (
            <View key={category}>
              <Text style={s.categoryTitle}>
                {CATEGORY_LABELS[category] || category}
              </Text>
              {items.map((item, idx) => (
                <View
                  key={`${category}-${idx}`}
                  style={[
                    s.cddItem,
                    item.completed ? s.cddItemCompleted : s.cddItemIncomplete,
                  ]}
                >
                  <Text style={[s.checkmark, item.completed ? s.checkmarkGreen : s.checkmarkGrey]}>
                    {item.completed ? '✓' : '✗'}
                  </Text>
                  <View style={s.cddItemText}>
                    <Text style={s.cddItemDescription}>{item.description}</Text>
                    {item.evidenceSummary && (
                      <Text style={s.cddItemEvidence}>{item.evidenceSummary}</Text>
                    )}
                    {item.amiqusUrl && (
                      <Link src={item.amiqusUrl} style={s.amiqusLink}>
                        View in Amiqus
                      </Link>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* EDD Triggers */}
        {eddTriggers && eddTriggers.length > 0 && (
          <View style={s.eddSection}>
            <Text style={s.eddTitle}>EDD Triggers</Text>
            {eddTriggers.map((t, i) => (
              <Text key={i} style={s.eddItem}>• {t.description}</Text>
            ))}
          </View>
        )}

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <View style={s.warningSection}>
            <Text style={s.warningTitle}>Warnings</Text>
            {warnings.map((w, i) => (
              <Text key={i} style={s.warningItem}>• {w}</Text>
            ))}
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

export type { AssessmentPdfParams, CddItemSummary };

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
