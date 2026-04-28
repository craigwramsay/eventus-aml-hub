/**
 * Resend email helper.
 *
 * Used for sending custom transactional emails from the Hub — currently
 * only invitation emails. We use our own email rather than Supabase's
 * built-in auth emails because Microsoft 365 / Outlook Safe Links
 * pre-fetches links in those emails, consuming one-time auth codes
 * before the recipient can click them.
 *
 * Configuration (Vercel environment variables):
 *   RESEND_API_KEY        Required. Sign up at resend.com.
 *   INVITE_EMAIL_FROM     Optional. Override the From: address.
 *                         Defaults to "AML Hub <onboarding@resend.dev>"
 *                         which works without domain verification but is
 *                         visibly Resend-branded. For production, verify
 *                         your own domain in Resend and set this to e.g.
 *                         "AML Hub <noreply@your-domain.com>".
 */

import { Resend } from 'resend';

const DEFAULT_FROM = 'AML Hub <onboarding@resend.dev>';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not configured. Add it in Vercel project settings before sending invitations.'
    );
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  return process.env.INVITE_EMAIL_FROM || DEFAULT_FROM;
}

export interface InvitationEmailParams {
  to: string;
  recipientName?: string | null;
  inviteUrl: string;
  invitedByName?: string | null;
  expiresAt: Date;
}

/**
 * Send the invitation email. Throws on failure so the caller can
 * roll back the database insert (or surface the error to the admin).
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const { to, recipientName, inviteUrl, invitedByName, expiresAt } = params;
  const resend = getResendClient();

  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  const inviter = invitedByName ? `${invitedByName} has invited you` : 'You have been invited';
  const expiryStr = expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>You've been invited to AML Hub</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <tr>
            <td style="background-color: #1a1a2e; padding: 28px 32px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600;">AML Hub</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #cbd5e1;">AML Compliance Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a2e;">You've been invited</h2>
              <p style="margin: 0 0 12px; color: #334155; line-height: 1.5;">${greeting}</p>
              <p style="margin: 0 0 12px; color: #334155; line-height: 1.5;">${inviter} to AML Hub. Click the button below to accept your invitation, set a password, and access the platform.</p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="${inviteUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Accept invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Or copy and paste this link into your browser:</p>
              <p style="margin: 0 0 24px; color: #64748b; font-size: 13px; word-break: break-all;">${inviteUrl}</p>
              <p style="margin: 0; color: #64748b; font-size: 13px;">This invitation expires on <strong>${expiryStr}</strong>. If you weren't expecting this email, you can safely ignore it.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f1f5f9; padding: 16px 32px; color: #94a3b8; font-size: 12px; text-align: center;">
              Sent by Eventus AML Compliance Hub
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = [
    greeting,
    '',
    `${inviter} to AML Hub.`,
    '',
    'Accept your invitation by visiting:',
    inviteUrl,
    '',
    `This invitation expires on ${expiryStr}.`,
    '',
    "If you weren't expecting this email, you can safely ignore it.",
    '',
    '— Eventus AML Compliance Hub',
  ].join('\n');

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: "You've been invited to AML Hub",
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message || JSON.stringify(error)}`);
  }
}
