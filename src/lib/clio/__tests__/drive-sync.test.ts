import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../client', () => ({
  ensureComplianceFolder: vi.fn(),
  uploadDocumentToClio: vi.fn(),
  getClioDocumentUrl: vi.fn(),
  ClioError: class ClioError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = 'ClioError';
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../token', () => ({
  getClioAccessTokenForFirm: vi.fn(),
}));

vi.mock('../drive-html', () => ({
  generateAssessmentHtml: vi.fn(() => '<html><body>Test HTML</body></html>'),
}));

import { syncEvidenceToClio, syncFinalisationHtmlToClio, retryFailedSync } from '../drive-sync';
import { ensureComplianceFolder, uploadDocumentToClio, getClioDocumentUrl, ClioError } from '../client';
import { getClioAccessTokenForFirm } from '../token';
import { generateAssessmentHtml } from '../drive-html';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a mock Supabase client with chainable query builder */
function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const storage = {
    from: vi.fn(() => ({
      download: vi.fn().mockResolvedValue({ data: new Blob(['file content'], { type: 'application/pdf' }), error: null }),
    })),
  };

  // Track inserted rows so tests can inspect them
  const insertedRows: unknown[] = [];

  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((row: unknown) => { insertedRows.push(row); return queryBuilder; }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const from = vi.fn(() => ({ ...queryBuilder }));

  return {
    from,
    storage,
    _queryBuilder: queryBuilder,
    _insertedRows: insertedRows,
    ...overrides,
  };
}

const FIRM_ID = 'firm-123';
const ASSESSMENT_ID = 'assess-123';
const EVIDENCE_ID = 'ev-123';
const CLIO_MATTER_ID = '456';
const USER_ID = 'user-123';
const SYNC_ID = 'sync-123';

describe('syncEvidenceToClio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClioAccessTokenForFirm).mockResolvedValue({
      accessToken: 'tok_valid',
      integrationId: 'int-1',
    });
    vi.mocked(ensureComplianceFolder).mockResolvedValue({ id: 100, etag: '', name: 'Compliance', parent: null, created_at: '', updated_at: '' });
    vi.mocked(uploadDocumentToClio).mockResolvedValue({ id: 200, name: 'test.pdf' });
    vi.mocked(getClioDocumentUrl).mockReturnValue('https://app.clio.com/nc/#/documents/200');
  });

  it('skips non-syncable evidence types (e.g. manual_record)', async () => {
    const supabase = createMockSupabase();
    // First call: fetch evidence
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: EVIDENCE_ID, evidence_type: 'manual_record' },
        error: null,
      }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    // Should not attempt folder creation or upload
    expect(ensureComplianceFolder).not.toHaveBeenCalled();
    expect(uploadDocumentToClio).not.toHaveBeenCalled();
  });

  it('skips amiqus evidence type (not syncable)', async () => {
    const supabase = createMockSupabase();
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: EVIDENCE_ID, evidence_type: 'amiqus' },
        error: null,
      }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);
    expect(ensureComplianceFolder).not.toHaveBeenCalled();
  });

  it('skips if evidence already synced (idempotent)', async () => {
    const supabase = createMockSupabase();
    // First call: fetch evidence (file_upload)
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: EVIDENCE_ID, evidence_type: 'file_upload', file_path: 'path/doc.pdf', file_name: 'doc.pdf' },
        error: null,
      }),
    } as any);
    // Second call: check existing sync → already synced
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: SYNC_ID, status: 'synced' },
        error: null,
      }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    expect(ensureComplianceFolder).not.toHaveBeenCalled();
    expect(uploadDocumentToClio).not.toHaveBeenCalled();
  });

  it('returns silently when evidence record not found', async () => {
    const supabase = createMockSupabase();
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);
    expect(ensureComplianceFolder).not.toHaveBeenCalled();
  });

  it('creates sync record and uploads file_upload evidence', async () => {
    const supabase = createMockSupabase();
    const evidence = {
      id: EVIDENCE_ID,
      evidence_type: 'file_upload',
      file_path: 'firms/firm-123/doc.pdf',
      file_name: 'doc.pdf',
    };

    // 1. Fetch evidence
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: evidence, error: null }),
    } as any);
    // 2. Check existing sync → none
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    // 3. Insert sync record
    supabase.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: SYNC_ID }, error: null }),
        }),
      }),
    } as any);
    // 4-8: Various update calls + storage download (handled via subsequent from() calls)
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    } as any);
    supabase.storage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob(['pdf content'], { type: 'application/pdf' }),
        error: null,
      }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    expect(ensureComplianceFolder).toHaveBeenCalledWith(456, 'tok_valid');
    expect(uploadDocumentToClio).toHaveBeenCalledWith(
      100, 'doc.pdf', expect.any(Buffer), 'application/pdf', 'tok_valid'
    );
    expect(getClioDocumentUrl).toHaveBeenCalledWith(200);
  });

  it('handles companies_house evidence type by serializing JSON', async () => {
    const supabase = createMockSupabase();
    const chData = { company_name: 'Test Ltd', company_number: '12345678' };
    const evidence = {
      id: EVIDENCE_ID,
      evidence_type: 'companies_house',
      data: chData,
      label: 'Test Ltd',
      file_path: null,
      file_name: null,
    };

    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: evidence, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: SYNC_ID }, error: null }),
        }),
      }),
    } as any);
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    expect(uploadDocumentToClio).toHaveBeenCalledWith(
      100, 'CompaniesHouse-Test Ltd.json', expect.any(Buffer), 'application/json', 'tok_valid'
    );
  });

  it('sets status to failed when Clio is not connected', async () => {
    vi.mocked(getClioAccessTokenForFirm).mockResolvedValue(null);

    const supabase = createMockSupabase();
    const evidence = { id: EVIDENCE_ID, evidence_type: 'file_upload', file_path: 'path/doc.pdf', file_name: 'doc.pdf' };

    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: evidence, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: SYNC_ID }, error: null }),
        }),
      }),
    } as any);
    // Update calls for status='failed'
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    // Should have called update with failed status
    expect(updateMock).toHaveBeenCalled();
    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)?.status === 'failed'
    );
    expect(failedCall).toBeTruthy();
    expect((failedCall![0] as Record<string, unknown>).error_message).toBe('Clio not connected');
  });

  it('sets status to failed on ClioError', async () => {
    const clioErr = new ClioError('Rate limited', 429);
    vi.mocked(ensureComplianceFolder).mockRejectedValueOnce(clioErr);

    const supabase = createMockSupabase();
    const evidence = { id: EVIDENCE_ID, evidence_type: 'file_upload', file_path: 'path/doc.pdf', file_name: 'doc.pdf' };

    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: evidence, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: SYNC_ID }, error: null }),
        }),
      }),
    } as any);
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    } as any);

    await syncEvidenceToClio(supabase as any, EVIDENCE_ID, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)?.status === 'failed'
    );
    expect(failedCall).toBeTruthy();
    expect((failedCall![0] as Record<string, unknown>).error_message).toContain('Rate limited');
    expect((failedCall![0] as Record<string, unknown>).error_message).toContain('429');
  });
});

describe('syncFinalisationHtmlToClio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClioAccessTokenForFirm).mockResolvedValue({
      accessToken: 'tok_valid',
      integrationId: 'int-1',
    });
    vi.mocked(ensureComplianceFolder).mockResolvedValue({ id: 100, etag: '', name: 'Compliance', parent: null, created_at: '', updated_at: '' });
    vi.mocked(uploadDocumentToClio).mockResolvedValue({ id: 300, name: 'assessment.html' });
    vi.mocked(getClioDocumentUrl).mockReturnValue('https://app.clio.com/nc/#/documents/300');
  });

  it('skips if already synced', async () => {
    const supabase = createMockSupabase();
    // Check existing → already synced
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: SYNC_ID, status: 'synced' },
        error: null,
      }),
    } as any);

    await syncFinalisationHtmlToClio(supabase as any, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    expect(generateAssessmentHtml).not.toHaveBeenCalled();
    expect(uploadDocumentToClio).not.toHaveBeenCalled();
  });

  it('generates HTML and uploads to Clio Drive', async () => {
    const supabase = createMockSupabase();
    const assessment = {
      id: ASSESSMENT_ID,
      reference: 'A-00001-2026',
      risk_level: 'MEDIUM',
      score: 6,
      finalised_at: '2026-03-07T14:30:00.000Z',
      input_snapshot: {},
      output_snapshot: {
        mandatoryActions: [{ description: 'Verify ID', category: 'cdd' }],
        eddTriggers: [],
      },
      matter_id: 'matter-123',
    };
    const matter = { reference: 'M-00001-2026', client_id: 'client-123' };
    const client = { name: 'Acme Ltd' };

    // 1. Check existing sync → none
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    // 2. Fetch assessment
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: assessment, error: null }),
    } as any);
    // 3. Fetch matter
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: matter, error: null }),
    } as any);
    // 4. Fetch client
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: client, error: null }),
    } as any);
    // 5. Insert sync record
    supabase.from.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: SYNC_ID }, error: null }),
        }),
      }),
    } as any);
    // 6+: Update calls
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    } as any);

    await syncFinalisationHtmlToClio(supabase as any, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);

    expect(generateAssessmentHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: ASSESSMENT_ID,
        assessmentReference: 'A-00001-2026',
        clientName: 'Acme Ltd',
        riskLevel: 'MEDIUM',
        score: 6,
      })
    );
    expect(uploadDocumentToClio).toHaveBeenCalledWith(
      100, 'AML-Assessment-A-00001-2026.html', expect.any(Buffer), 'text/html', 'tok_valid'
    );
  });

  it('returns silently when assessment not found', async () => {
    const supabase = createMockSupabase();
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    await syncFinalisationHtmlToClio(supabase as any, ASSESSMENT_ID, FIRM_ID, CLIO_MATTER_ID, USER_ID);
    expect(generateAssessmentHtml).not.toHaveBeenCalled();
  });
});

describe('retryFailedSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClioAccessTokenForFirm).mockResolvedValue({
      accessToken: 'tok_valid',
      integrationId: 'int-1',
    });
    vi.mocked(ensureComplianceFolder).mockResolvedValue({ id: 100, etag: '', name: 'Compliance', parent: null, created_at: '', updated_at: '' });
    vi.mocked(uploadDocumentToClio).mockResolvedValue({ id: 200, name: 'doc.pdf' });
    vi.mocked(getClioDocumentUrl).mockReturnValue('https://app.clio.com/nc/#/documents/200');
  });

  it('does nothing when sync record not found', async () => {
    const supabase = createMockSupabase();
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    await retryFailedSync(supabase as any, SYNC_ID);
    expect(ensureComplianceFolder).not.toHaveBeenCalled();
  });

  it('does nothing when sync status is not failed', async () => {
    const supabase = createMockSupabase();
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: SYNC_ID, status: 'synced', sync_type: 'evidence' },
        error: null,
      }),
    } as any);

    await retryFailedSync(supabase as any, SYNC_ID);
    expect(ensureComplianceFolder).not.toHaveBeenCalled();
  });

  it('retries evidence sync for failed records', async () => {
    const supabase = createMockSupabase();
    const syncRecord = {
      id: SYNC_ID,
      status: 'failed',
      sync_type: 'evidence',
      evidence_id: EVIDENCE_ID,
      firm_id: FIRM_ID,
      clio_matter_id: CLIO_MATTER_ID,
      assessment_id: ASSESSMENT_ID,
    };
    const evidence = {
      id: EVIDENCE_ID,
      evidence_type: 'file_upload',
      file_path: 'path/doc.pdf',
      file_name: 'doc.pdf',
    };

    // 1. Fetch sync record
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: syncRecord, error: null }),
    } as any);
    // 2. Fetch evidence
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: evidence, error: null }),
    } as any);
    // 3+: Update calls + storage
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 1 }, error: null }),
    } as any);
    supabase.storage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob(['pdf content'], { type: 'application/pdf' }),
        error: null,
      }),
    } as any);

    await retryFailedSync(supabase as any, SYNC_ID);

    expect(ensureComplianceFolder).toHaveBeenCalled();
    expect(uploadDocumentToClio).toHaveBeenCalled();
  });

  it('marks as failed when evidence not found during retry', async () => {
    const supabase = createMockSupabase();
    const syncRecord = {
      id: SYNC_ID,
      status: 'failed',
      sync_type: 'evidence',
      evidence_id: EVIDENCE_ID,
      firm_id: FIRM_ID,
      clio_matter_id: CLIO_MATTER_ID,
    };

    // 1. Fetch sync record
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: syncRecord, error: null }),
    } as any);
    // 2. Fetch evidence → not found
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
    // 3+: Update calls for failed status
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 1 }, error: null }),
    } as any);

    await retryFailedSync(supabase as any, SYNC_ID);

    expect(ensureComplianceFolder).not.toHaveBeenCalled();
    const failedCall = updateMock.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)?.error_message === 'Evidence record not found'
    );
    expect(failedCall).toBeTruthy();
  });
});
