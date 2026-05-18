'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Profile = {
  id: number;
  contact_name: string;
  contact_email: string;
  contact_no: string;
  contact_alt_no: string;
  contact_desgn: string;
  linkedIn_profile: string;
};

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setP(await api.get<Profile>('/profile')); }
      catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); }
      finally { setLoading(false); }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setSaving(true); setError(null); setMsg(null);
    try {
      await api.put('/profile', {
        contact_name: p.contact_name,
        contact_alt_no: p.contact_alt_no,
        contact_desgn: p.contact_desgn,
        linkedIn_profile: p.linkedIn_profile,
      });
      setMsg('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (!p) return <div className="text-red-600">{error || 'Profile not found'}</div>;

  return (
    <form onSubmit={save} className="space-y-4 max-w-lg">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="card p-4 space-y-3">
        <Field label="Name" value={p.contact_name} onChange={(v) => setP({ ...p, contact_name: v })} />
        <Field label="Email (read-only)" value={p.contact_email} readOnly />
        <Field label="Mobile (read-only)" value={p.contact_no} readOnly />
        <Field label="Alt Mobile" value={p.contact_alt_no || ''} onChange={(v) => setP({ ...p, contact_alt_no: v })} />
        <Field label="Designation" value={p.contact_desgn || ''} onChange={(v) => setP({ ...p, contact_desgn: v })} />
        <Field label="LinkedIn" value={p.linkedIn_profile || ''} onChange={(v) => setP({ ...p, linkedIn_profile: v })} />
        {error && <div className="text-sm text-red-600">{error}</div>}
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, readOnly }: {
  label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="input"
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}
