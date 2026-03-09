/**
 * Clio Drive HTML Generator
 *
 * Generates a self-contained HTML summary file for a finalised assessment.
 * Saved to Clio Drive so users can find the assessment from within Clio.
 */

interface ActionEvidence {
  type: string;           // 'amiqus', 'file_upload', 'companies_house', 'manual_record', etc.
  source: string;         // 'Amiqus', 'Manual', 'Companies House', etc.
  verifiedAt?: string;    // Date string
  label?: string;         // Evidence label
  amiqusUrl?: string;     // Link to Amiqus record (for identity verification)
}

interface AssessmentHtmlParams {
  assessmentId: string;
  assessmentReference: string;
  clientName: string;
  matterReference: string;
  riskLevel: string;
  score: number;
  finalisedAt: string;
  mandatoryActions: Array<{
    actionId?: string;
    description: string;
    category: string;
    completed?: boolean;
    evidence?: ActionEvidence[];
  }>;
  eddTriggers?: Array<{ description: string }>;
  clioDocuments?: Array<{ label: string; url: string }>;
  hubBaseUrl: string;
}

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate an HTML summary file for a finalised assessment.
 * The file is self-contained with inline CSS and links back to the Hub.
 */
export function generateAssessmentHtml(params: AssessmentHtmlParams): string {
  const {
    assessmentId,
    assessmentReference,
    clientName,
    matterReference,
    riskLevel,
    score,
    finalisedAt,
    mandatoryActions,
    eddTriggers,
    clioDocuments,
    hubBaseUrl,
  } = params;

  const riskColour = RISK_COLOURS[riskLevel] || RISK_COLOURS.MEDIUM;
  const hubUrl = `${hubBaseUrl}/assessments/${assessmentId}`;
  const generatedAt = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Group actions by category
  type ActionEntry = typeof mandatoryActions[number];
  const actionsByCategory = new Map<string, ActionEntry[]>();
  for (const action of mandatoryActions) {
    const cat = action.category;
    if (!actionsByCategory.has(cat)) {
      actionsByCategory.set(cat, []);
    }
    actionsByCategory.get(cat)!.push(action);
  }

  // Count completed vs total
  const hasEvidenceData = mandatoryActions.some(a => a.completed !== undefined);
  const completedCount = mandatoryActions.filter(a => a.completed).length;
  const totalCount = mandatoryActions.length;

  let actionsHtml = '';

  if (hasEvidenceData) {
    actionsHtml += `<p style="margin:0 0 12px;font-size:13px;color:#666;">${completedCount} of ${totalCount} requirements completed</p>`;
  }

  for (const [category, actions] of actionsByCategory) {
    const label = CATEGORY_LABELS[category] || category;
    actionsHtml += `<h3 style="margin:16px 0 8px;font-size:14px;color:#333;">${escapeHtml(label)}</h3>`;

    for (const action of actions) {
      const checkmark = action.completed
        ? '<span style="color:#155724;font-weight:bold;">&#10003;</span>'
        : '<span style="color:#999;">&#10007;</span>';
      const statusIndicator = hasEvidenceData ? `${checkmark} ` : '';

      actionsHtml += `<div style="margin:6px 0;padding:8px 12px;background:#f8f9fa;border-radius:4px;border-left:3px solid ${action.completed ? '#28a745' : '#dee2e6'};">`;
      actionsHtml += `<div style="font-size:13px;color:#333;">${statusIndicator}${escapeHtml(action.description)}</div>`;

      // Show evidence details if present
      if (action.evidence && action.evidence.length > 0) {
        for (const ev of action.evidence) {
          const datePart = ev.verifiedAt
            ? ` &mdash; ${new Date(ev.verifiedAt + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : '';
          const linkPart = ev.amiqusUrl
            ? ` &mdash; <a href="${escapeHtml(ev.amiqusUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">View in Amiqus</a>`
            : '';
          actionsHtml += `<div style="font-size:12px;color:#666;margin-top:4px;padding-left:18px;">${escapeHtml(ev.source)}${datePart}${linkPart}</div>`;
        }
      }

      actionsHtml += '</div>';
    }
  }

  let eddHtml = '';
  if (eddTriggers && eddTriggers.length > 0) {
    eddHtml = `
      <div style="margin:16px 0;padding:12px 16px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px;">
        <strong style="font-size:13px;color:#856404;">EDD Triggers</strong>
        <ul style="margin:8px 0 0;padding-left:24px;">
          ${eddTriggers.map((t) => `<li style="font-size:13px;color:#856404;">${escapeHtml(t.description)}</li>`).join('')}
        </ul>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AML Risk Assessment - ${escapeHtml(clientName)} (${escapeHtml(assessmentReference)})</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);overflow:hidden;">

    <!-- Header -->
    <div style="padding:24px 32px;background:#1a1a2e;color:#fff;">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">AML Risk Assessment</h1>
      <p style="margin:0;font-size:14px;opacity:0.85;">${escapeHtml(clientName)}</p>
    </div>

    <!-- Risk Level Badge -->
    <div style="padding:24px 32px;text-align:center;border-bottom:1px solid #eee;">
      <div style="display:inline-block;padding:12px 32px;border-radius:8px;background:${riskColour.bg};color:${riskColour.text};font-size:18px;font-weight:700;">
        ${escapeHtml(riskLevel)} RISK
      </div>
      <p style="margin:8px 0 0;font-size:14px;color:#666;">Score: ${score}</p>
    </div>

    <!-- Assessment Details -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;">
        <tr><td style="padding:4px 0;font-weight:600;width:140px;">Assessment Ref</td><td style="padding:4px 0;">${escapeHtml(assessmentReference)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Matter Ref</td><td style="padding:4px 0;">${escapeHtml(matterReference)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Finalised</td><td style="padding:4px 0;">${formatDate(finalisedAt)}</td></tr>
      </table>
    </div>

    <!-- CDD Requirements -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Compliance Requirements</h2>
      ${actionsHtml}
      ${eddHtml}
    </div>

    ${clioDocuments && clioDocuments.length > 0 ? `<!-- Compliance Documents in Clio -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Compliance Documents in Clio</h2>
      <ul style="margin:0;padding-left:24px;">
        ${clioDocuments.map((doc) => `<li style="margin:6px 0;font-size:13px;"><a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">${escapeHtml(doc.label)}</a></li>`).join('')}
      </ul>
    </div>` : ''}

    <!-- Link to Hub -->
    <div style="padding:24px 32px;text-align:center;">
      <a href="${escapeHtml(hubUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;padding:12px 32px;background:#1a1a2e;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
        View Full Assessment in Eventus Hub
      </a>
      <p style="margin:12px 0 0;font-size:12px;color:#999;">
        Click the button above to view the complete assessment, CDD checklist, evidence, and scoring breakdown.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8f9fa;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:11px;color:#999;">
        Generated by Eventus AML Compliance Hub on ${generatedAt}
      </p>
    </div>

  </div>
</body>
</html>`;
}
