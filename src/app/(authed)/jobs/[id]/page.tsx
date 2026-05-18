'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { STATUS_LABELS, formatDate } from '@/lib/utils';

type Job = {
  job_id: number;
  job_reference_id: string;
  client_ref_id: string;
  job_status: number;
  job_desc: string;
  customer_name: string;
  customer_mob_no: string;
  city_name: string;
  easyfixer_name: string | null;
  owner_name: string | null;
  requested_date_time: string;
  scheduled_date_time: string | null;
  checkin_date_time: string | null;
  checkout_date_time: string | null;
  approved_on_date_time: string | null;
  approval_reject_date_time: string | null;
  approval_sent_on_date_time: string | null;
  services: Array<{
    job_service_id: number; quantity: number;
    total_charge: number; material_charge: number;
    job_service_status: number;
  }>;
};

type EstimateLine = {
  job_service_id: number;
  service_name: string | null;        // null when rate-card row is missing
  quantity: number | string;          // mysql2 returns DECIMAL as string
  total_charge: number | string;
  material_charge: number | string;
  line_total: number;
};
type EstimatePreview = {
  job_id: number;
  services: EstimateLine[];           // empty array when no approval-pending services
  totals: { services_subtotal: number; material_subtotal: number; grand_total: number };
  already_approved: boolean;
  already_rejected: boolean;
};

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [estimate, setEstimate] = useState<EstimatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const j = await api.get<Job>(`/jobs/${id}`);
      setJob(j);
      try {
        const e = await api.get<EstimatePreview>(`/jobs/${id}/estimate-preview`);
        setEstimate(e);
      } catch { /* no estimate yet — fine */ }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load job');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [id]);

  async function approve() {
    setActing(true); setError(null);
    try {
      await api.patch(`/jobs/${id}/estimate/approve`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Approve failed');
    } finally { setActing(false); }
  }
  async function reject() {
    if (rejectReason.trim().length < 3) { setError('Reason required (min 3 chars)'); return; }
    setActing(true); setError(null);
    try {
      await api.patch(`/jobs/${id}/estimate/reject`, { reason: rejectReason.trim() });
      setShowReject(false);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reject failed');
    } finally { setActing(false); }
  }

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (!job) return <div className="text-red-600">{error || 'Job not found'}</div>;

  const showActions = !job.approved_on_date_time && !job.approval_reject_date_time
    && estimate && !estimate.already_approved && !estimate.already_rejected;

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-primary hover:underline">← Back</button>

      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Job #{job.job_id}</h1>
            <p className="text-sm text-slate-600 font-mono">{job.job_reference_id || job.client_ref_id}</p>
          </div>
          <span className="badge bg-blue-50 text-blue-700">{STATUS_LABELS[job.job_status] || job.job_status}</span>
        </div>
        {job.job_desc && <p className="text-sm text-slate-700">{job.job_desc}</p>}
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pt-2 border-t">
          <Field label="Customer" value={`${job.customer_name} · ${job.customer_mob_no}`} />
          <Field label="City" value={job.city_name} />
          <Field label="Easyfixer" value={job.easyfixer_name || '—'} />
          <Field label="Requested" value={formatDate(job.requested_date_time)} />
          <Field label="Scheduled" value={formatDate(job.scheduled_date_time)} />
          <Field label="Owner" value={job.owner_name || '—'} />
        </dl>
      </div>

      {estimate && (
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Estimate</h2>
            <div className="text-sm text-slate-500">
              {estimate.already_approved && '✓ Approved'}
              {estimate.already_rejected && '✗ Rejected'}
            </div>
          </div>
          {estimate.services.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No services are currently awaiting approval on this job.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Service</th><th className="!text-right">Qty</th><th className="!text-right">Unit</th><th className="!text-right">Material</th><th className="!text-right">Line Total</th></tr>
              </thead>
              <tbody>
                {estimate.services.map((s) => (
                  <tr key={s.job_service_id}>
                    <td>{s.service_name || '—'}</td>
                    <td className="text-right font-mono">{Number(s.quantity)}</td>
                    <td className="text-right font-mono">{Number(s.total_charge).toFixed(2)}</td>
                    <td className="text-right font-mono">{Number(s.material_charge).toFixed(2)}</td>
                    <td className="text-right font-mono font-medium">{Number(s.line_total).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={4} className="text-right">Grand Total</td>
                  <td className="text-right font-mono">{Number(estimate.totals.grand_total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {showActions && estimate.services.length > 0 && (
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <button onClick={approve} disabled={acting} className="btn-primary">
                {acting ? 'Working…' : '✓ Approve Estimate'}
              </button>
              <button onClick={() => setShowReject(true)} disabled={acting} className="btn-outline">
                ✗ Reject
              </button>
            </div>
          )}
        </div>
      )}

      {showReject && (
        <div className="card p-4 border-rose-200">
          <h3 className="font-semibold mb-2">Reason for rejection</h3>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="input min-h-[80px]"
            placeholder="Why are you rejecting this estimate?"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={reject} disabled={acting} className="btn-primary">Submit Rejection</button>
            <button onClick={() => setShowReject(false)} disabled={acting} className="btn-outline">Cancel</button>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
