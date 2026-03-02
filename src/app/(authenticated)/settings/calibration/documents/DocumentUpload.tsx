'use client';

import { useState } from 'react';
import { uploadFirmDocument, deleteFirmDocument } from '@/app/actions/config';
import type { FirmDocument } from '@/lib/supabase/types';

interface DocumentUploadProps {
  documents: FirmDocument[];
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  pwra: 'Practice-Wide Risk Assessment (PWRA)',
  pcp: 'Policies, Controls & Procedures (PCP)',
  aml_policy: 'AML Policy',
  other: 'Other',
};

export function DocumentUpload({ documents: initialDocs }: DocumentUploadProps) {
  const [documents, setDocuments] = useState(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setUploading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const result = await uploadFirmDocument(formData);

    if (result.success) {
      setDocuments((prev) => [result.data, ...prev]);
      setSuccess(`Uploaded "${result.data.file_name}" successfully.`);
      form.reset();
    } else {
      setError(result.error);
    }

    setUploading(false);
  }

  async function handleDelete(docId: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;

    const result = await deleteFirmDocument(docId);
    if (result.success) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      setError(result.error);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      {/* Upload form */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
          Upload Document
        </h2>

        {error && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: '0.875rem',
            backgroundColor: 'var(--status-high-bg)',
            color: 'var(--status-high-text)',
            border: '1px solid var(--status-high-border)',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: '0.875rem',
            backgroundColor: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0',
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleUpload}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Document Type
            </label>
            <select
              name="document_type"
              required
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="pwra">Practice-Wide Risk Assessment (PWRA)</option>
              <option value="pcp">Policies, Controls & Procedures (PCP)</option>
              <option value="aml_policy">AML Policy</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              File
            </label>
            <input
              type="file"
              name="file"
              accept=".pdf,.docx,.doc"
              required
              style={{ fontSize: '0.875rem' }}
            />
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
              Accepted formats: PDF, DOCX, DOC
            </p>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Description (optional)
            </label>
            <input
              type="text"
              name="description"
              placeholder="Brief description of the document"
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 'var(--space-2) var(--space-5)',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      {/* Document list */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
          Uploaded Documents
        </h2>

        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>
            No documents uploaded yet.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Type', 'File', 'Size', 'Uploaded', 'Description', ''].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: 'var(--space-2) var(--space-3)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    {doc.file_name}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    {formatSize(doc.file_size)}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    {formatDate(doc.uploaded_at)}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    {doc.description || '-'}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    <button
                      onClick={() => handleDelete(doc.id, doc.file_name)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--status-high-text)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        textDecoration: 'underline',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
