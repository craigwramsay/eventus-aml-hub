'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MFASetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleEnrol() {
    setIsEnrolling(true);
    setError(null);

    const { data, error: enrolError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    });

    if (enrolError || !data) {
      setError(enrolError?.message || 'Failed to start MFA enrolment');
      setIsEnrolling(false);
      return;
    }

    setQrCode(data.totp.qr_code);
    setFactorId(data.id);
    setIsEnrolling(false);
  }

  async function handleVerify() {
    if (!factorId || !verifyCode) return;

    setIsVerifying(true);
    setError(null);

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError || !challengeData) {
      setError(challengeError?.message || 'Failed to create MFA challenge');
      setIsVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError(verifyError.message);
      setIsVerifying(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div style={{ maxWidth: '480px', margin: '2rem auto', padding: '2rem' }}>
      <h1>Set Up Two-Factor Authentication</h1>
      <p>
        For the security of regulated client data, two-factor authentication is
        required. Scan the QR code with your authenticator app (e.g. Google
        Authenticator, Authy).
      </p>

      {error && (
        <div style={{ color: '#991b1b', background: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!qrCode ? (
        <button
          onClick={handleEnrol}
          disabled={isEnrolling}
          style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}
        >
          {isEnrolling ? 'Setting up...' : 'Begin Setup'}
        </button>
      ) : (
        <div>
          <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="MFA QR Code" width={200} height={200} />
          </div>
          <p>Enter the 6-digit code from your authenticator app:</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{ padding: '0.75rem', fontSize: '1.25rem', letterSpacing: '0.25rem', width: '10rem', textAlign: 'center' }}
            />
            <button
              onClick={handleVerify}
              disabled={isVerifying || verifyCode.length !== 6}
              style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
