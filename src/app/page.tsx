'use client';

/*
 * Client SPOC login — 2-step OTP flow. Mirrors the CRM_UI login UX.
 * Backend endpoints: POST /api/client/auth/login-otp (sends OTP),
 *                    POST /api/client/auth/verify-otp (returns token).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setToken, getToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'identifier' | 'otp'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const otpInputs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (getToken()) router.push('/dashboard');
  }, [router]);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null); setLoading(true);
    try {
      await api.post<{ delivered: boolean }>('/auth/login-otp', { identifier: identifier.trim() });
      setStep('otp');
      setTimeout(() => otpInputs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP');
    } finally { setLoading(false); }
  }

  async function verifyOtp(otpString: string) {
    setError(null); setLoading(true);
    try {
      const res = await api.post<{ token: string }>('/auth/verify-otp', {
        identifier: identifier.trim(),
        otp: Number(otpString),
      });
      setToken(res.token);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid OTP');
      setOtp(['', '', '', '']);
      otpInputs.current[0]?.focus();
    } finally { setLoading(false); }
  }

  function onOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 3) otpInputs.current[idx + 1]?.focus();
    if (next.every((d) => d) && next.join('').length === 4) {
      void verifyOtp(next.join(''));
    }
  }

  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (txt.length === 4) {
      e.preventDefault();
      const split = txt.split('');
      setOtp(split);
      void verifyOtp(txt);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">EasyFix</h1>
          <p className="text-sm text-slate-600">Client SPOC Portal</p>
        </div>

        {step === 'identifier' && (
          <form onSubmit={sendOtp} className="space-y-3">
            <label className="block text-sm font-medium">Email or 10-digit mobile</label>
            <input
              autoFocus
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={loading || !identifier.trim()} className="btn-primary w-full justify-center">
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Enter the 4-digit OTP sent to <span className="font-medium">{identifier}</span>.
            </p>
            <div className="flex gap-2 justify-center">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { if (el) otpInputs.current[i] = el; }}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => onOtpChange(i, e.target.value)}
                  onPaste={onOtpPaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !otp[i] && i > 0) otpInputs.current[i - 1]?.focus();
                  }}
                  className="input w-12 text-center text-lg font-bold"
                />
              ))}
            </div>
            {error && <div className="text-sm text-red-600 text-center">{error}</div>}
            <div className="flex justify-between text-sm">
              <button onClick={() => { setStep('identifier'); setOtp(['', '', '', '']); }} className="text-slate-600 hover:underline">
                Change number
              </button>
              <button onClick={() => sendOtp()} disabled={loading} className="text-primary hover:underline">
                Resend OTP
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
