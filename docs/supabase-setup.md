# Supabase Configuration Guide

## Email Templates

Configure these in **Supabase Dashboard → Authentication → Email Templates**.

### Invite User

**Subject:** You've been invited to Eventus's Compliance Hub

> **Note:** Supabase templates don't support dynamic subjects. For multi-tenant, replace with custom email sending (e.g., Resend/SendGrid).

**Body:**
```html
<h2>You've been invited to Eventus's Compliance Hub</h2>
<p>You have been invited to join your firm's AML compliance hub.</p>
<p><a href="{{ .SiteURL }}/auth/callback?code={{ .Token }}&type=invite">Accept Invitation</a></p>
```

### Password Recovery (Reset)

**Subject:** Reset your AML Hub password

**Body:**
```html
<h2>Reset Your Password</h2>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .SiteURL }}/auth/callback?code={{ .Token }}&type=recovery">Reset Password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
```

### Confirm Signup (used for invitations via signUp)

**Subject:** You've been invited to Eventus's Compliance Hub

**Body:**
```html
<h2>You've been invited to Eventus's Compliance Hub</h2>
<p>You have been invited to join your firm's AML compliance hub.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/invite/accept">Accept Invitation</a></p>
```

## Auth Settings

Configure in **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` (development) or your production URL
- **Redirect URLs:** Add `http://localhost:3000/auth/callback`

Configure in **Supabase Dashboard → Authentication → Auth Providers → Email**:

- **Enable Email provider:** Yes
- **Confirm email:** Yes (recommended for production)
- **Secure email change:** Yes

## MFA Settings

Configure in **Supabase Dashboard → Authentication → Multi-Factor Authentication**:

- **Enable MFA:** Yes
- **TOTP:** Enabled

## JWT Settings

Configure in **Supabase Dashboard → Authentication → JWT Settings**:

- **JWT expiry:** 3600 (1 hour) — the app enforces a 30-minute idle timeout via middleware independently

## RLS Policies

All tables have RLS enabled. Policies enforce firm-level isolation via `firm_id`. Do **not** add AAL2 (MFA) RLS policies — MFA is enforced in the Next.js middleware instead to avoid read-blocking issues during the onboarding flow.
