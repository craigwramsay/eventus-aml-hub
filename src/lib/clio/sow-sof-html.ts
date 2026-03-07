/**
 * SoW/SoF HTML Generators for Clio Drive
 *
 * Renders Source of Wealth and Source of Funds declarations as
 * self-contained HTML documents for upload to Clio Drive.
 */

interface FieldDef {
  id: string;
  label: string;
  type: 'text' | 'list';
}

const SOW_INDIVIDUAL_FIELDS: FieldDef[] = [
  { id: 'sow_ind_2', label: 'Declared source(s) of wealth', type: 'list' },
  { id: 'sow_ind_3', label: 'Details for each declared source', type: 'text' },
  { id: 'sow_ind_4', label: 'Estimated total wealth range', type: 'text' },
  { id: 'sow_ind_5', label: 'How long has the client held the declared wealth?', type: 'text' },
];

const SOW_CORPORATE_FIELDS: FieldDef[] = [
  { id: 'sow_corp_2', label: 'Declared source(s) of wealth', type: 'list' },
  { id: 'sow_corp_3', label: 'Details for each declared source', type: 'text' },
  { id: 'sow_corp_4', label: 'How long has the entity been trading or operating?', type: 'text' },
  { id: 'sow_corp_5', label: 'Most recent accounts period', type: 'text' },
];

const SOF_FIELDS: FieldDef[] = [
  { id: 'sof_2', label: 'Who is providing the funds?', type: 'text' },
  { id: 'sof_3', label: 'Origin of funds', type: 'text' },
  { id: 'sof_4', label: 'Bank or institution name', type: 'text' },
  { id: 'sof_5', label: 'Account holder name', type: 'text' },
  { id: 'sof_6', label: 'Expected amount and timing', type: 'text' },
];

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

function renderFieldValue(value: string | string[] | undefined, fieldType: 'text' | 'list'): string {
  if (!value) return '<span style="color:#999;font-style:italic;">Not provided</span>';

  if (fieldType === 'list' && Array.isArray(value)) {
    if (value.length === 0) return '<span style="color:#999;font-style:italic;">None selected</span>';
    return '<ul style="margin:4px 0 0;padding-left:20px;">' +
      value.map(v => `<li style="margin:2px 0;font-size:13px;">${escapeHtml(v)}</li>`).join('') +
      '</ul>';
  }

  const text = Array.isArray(value) ? value.join(', ') : value;
  return escapeHtml(text);
}

function renderFields(
  fields: FieldDef[],
  formData: Record<string, string | string[]>,
): string {
  let rows = '';
  for (const field of fields) {
    const value = formData[field.id];
    rows += `
      <tr>
        <td style="padding:8px 12px;font-weight:600;vertical-align:top;width:240px;border-bottom:1px solid #eee;font-size:13px;color:#333;">${escapeHtml(field.label)}</td>
        <td style="padding:8px 12px;vertical-align:top;border-bottom:1px solid #eee;font-size:13px;color:#444;">${renderFieldValue(value, field.type)}</td>
      </tr>`;
  }
  return rows;
}

function wrapDocument(
  title: string,
  subtitle: string,
  clientName: string,
  assessmentReference: string,
  matterReference: string,
  submittedAt: string,
  fieldsHtml: string,
): string {
  const generatedAt = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(clientName)} (${escapeHtml(assessmentReference)})</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);overflow:hidden;">

    <!-- Header -->
    <div style="padding:24px 32px;background:#1a1a2e;color:#fff;">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">${escapeHtml(title)}</h1>
      <p style="margin:0;font-size:14px;opacity:0.85;">${escapeHtml(subtitle)}</p>
    </div>

    <!-- Details -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;">
        <tr><td style="padding:4px 0;font-weight:600;width:140px;">Client</td><td style="padding:4px 0;">${escapeHtml(clientName)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Assessment Ref</td><td style="padding:4px 0;">${escapeHtml(assessmentReference)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Matter Ref</td><td style="padding:4px 0;">${escapeHtml(matterReference)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Submitted</td><td style="padding:4px 0;">${formatDate(submittedAt)}</td></tr>
      </table>
    </div>

    <!-- Declaration Fields -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Declaration</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${fieldsHtml}
      </table>
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

export interface SowHtmlParams {
  clientName: string;
  matterReference: string;
  assessmentReference: string;
  formType: 'individual' | 'corporate';
  formData: Record<string, string | string[]>;
  submittedAt: string;
}

export interface SofHtmlParams {
  clientName: string;
  matterReference: string;
  assessmentReference: string;
  formData: Record<string, string | string[]>;
  submittedAt: string;
}

/**
 * Generate a self-contained HTML document for a Source of Wealth declaration.
 */
export function generateSowHtml(params: SowHtmlParams): string {
  const fields = params.formType === 'corporate' ? SOW_CORPORATE_FIELDS : SOW_INDIVIDUAL_FIELDS;
  const typeLabel = params.formType === 'corporate' ? 'Corporate / LLP' : 'Individual';
  const title = 'Source of Wealth Declaration';

  return wrapDocument(
    title,
    `${typeLabel} — ${params.clientName}`,
    params.clientName,
    params.assessmentReference,
    params.matterReference,
    params.submittedAt,
    renderFields(fields, params.formData),
  );
}

/**
 * Generate a self-contained HTML document for a Source of Funds declaration.
 */
export function generateSofHtml(params: SofHtmlParams): string {
  return wrapDocument(
    'Source of Funds Declaration',
    params.clientName,
    params.clientName,
    params.assessmentReference,
    params.matterReference,
    params.submittedAt,
    renderFields(SOF_FIELDS, params.formData),
  );
}
