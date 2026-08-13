import { describe, it, expect } from 'vitest';
import { normaliseAmiqusWebhook } from '../route';
import type { AmiqusWebhookPayload } from '@/lib/amiqus';

describe('normaliseAmiqusWebhook', () => {
  it('reads nested current-shape payload (trigger.alias + data.record)', () => {
    const payload: AmiqusWebhookPayload = {
      webhook: { uuid: 'wh-1', events: ['record.*'] },
      trigger: { triggered_at: '2026-07-24T10:39:03Z', alias: 'record.updated' },
      data: {
        record: {
          id: 2778,
          type: 'client',
          status: 'in_progress',
        },
        client: { id: 991 },
      },
    };
    expect(normaliseAmiqusWebhook(payload)).toEqual({
      eventName: 'record.updated',
      recordId: 2778,
      recordType: 'client',
      status: 'in_progress',
      completedAt: undefined,
    });
  });

  it('reads legacy flat-shape payload (event + data.id)', () => {
    const payload = {
      event: 'record.finished',
      data: {
        id: 12345,
        status: 'complete',
        client_id: 42,
        completed_at: '2026-03-10T09:15:00Z',
      },
    } as AmiqusWebhookPayload;
    expect(normaliseAmiqusWebhook(payload)).toEqual({
      eventName: 'record.finished',
      recordId: 12345,
      recordType: undefined,
      status: 'complete',
      completedAt: '2026-03-10T09:15:00Z',
    });
  });

  it('identifies organisation-typed records', () => {
    const payload: AmiqusWebhookPayload = {
      trigger: { alias: 'record.updated' },
      data: {
        record: { id: 5000, type: 'organisation' },
      },
    };
    const norm = normaliseAmiqusWebhook(payload);
    expect(norm.recordType).toBe('organisation');
  });

  it('handles absent record type (treated as client by handler)', () => {
    const payload: AmiqusWebhookPayload = {
      trigger: { alias: 'record.updated' },
      data: {
        record: { id: 7777 },
      },
    };
    expect(normaliseAmiqusWebhook(payload).recordType).toBeUndefined();
  });

  it('surfaces completed_at from the nested record.completed_at field', () => {
    const payload: AmiqusWebhookPayload = {
      trigger: { alias: 'record.finished' },
      data: {
        record: { id: 99, type: 'client', completed_at: '2026-06-25T14:30:00Z' },
      },
    };
    expect(normaliseAmiqusWebhook(payload).completedAt).toBe('2026-06-25T14:30:00Z');
  });
});
