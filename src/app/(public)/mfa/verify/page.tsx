'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MFAVerifyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    async function loadFactors() {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactors = factorsData?.all?.filter(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      );
      if (totpFactors && totpFactors.length > 0) {
        setFactorId(totpFactors[0].id);
      } else {
        // No MFA enrolled, redirect to setup
        router.push('/mfa/setup');
      }
    }
    loadFactors();
  }, [router, supabase]);

  async function handleVerify() {
    if (!factorId || code.length !== 6) return;

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
      code,
    });

    if (verifyError) {
      setError('Invalid code. Please try again.');
      setCode('');
      setIsVerifying(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem' }}>
      <h1>Two-Factor Authentication</h1>
      <p>Enter the 6-digit code from your authenticator app.</p>

      {error && (
        <div style={{ color: '#991b1b', background: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
          placeholder="000000"
          autoFocus
          style={{ padding: '0.75rem', fontSize: '1.25rem', letterSpacing: '0.25rem', width: '10rem', textAlign: 'center' }}
        />
        <button
          onClick={handleVerify}
          disabled={isVerifying || code.length !== 6}
          style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}
        >
          {isVerifying ? 'Verifying...' : 'Verify'}
        </button>
      </div>
    </div>
  );
}
