'use client';

/*
 * My Order History — primary landing page after SPOC login.
 *
 * Replicates the legacy Angular_ClientDashboard dual-tab pattern:
 *  - "All Orders"           → no status filter
 *  - "Completed & Under Audit" → status=3 (Completed) + status=5 (Completed alt)
 *
 * Backend: GET /api/client/jobs?status=<n>&q=<text>&limit=&offset=
 * Response shape: { items: Job[], total: number }
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Upload, Download, AlertTriangle, Search,
  ChevronLeft, ChevronRight, Star,
} from 'lucide-react';
import { useFetch, useDebouncedValue } from '@/lib/hooks';
import { STATUS_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Job = {
  job_id: number;
  job_reference_id: string | null;
  client_ref_id: string | null;
  job_status: number;
  customer_name: string | null;
  customer_mob_no: string | null;
  city_name: string | null;
  requested_date_time: string | null;
  scheduled_date_time: string | null;
  easyfixer_name: string | null;
  source_type?: string | null;
  bucket_status?: string | null;
  rating?: number | null;
  is_escalated?: boolean | number | null;
};

type TabKey = 'all' | 'completed';
const TABS: Array<{ key: TabKey; label: string; statuses: number[] | null }> = [
  { key: 'all',       label: 'All Orders',                statuses: null },
  { key: 'completed', label: 'Completed & Under Audit',   statuses: [3, 5] },
];

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20];

function statusBadgeClass(status: number) {
  // Map each backend status to a red-themed badge tint
  switch (status) {
    case 0:  return 'bg-amber-50 text-amber-700 ring-amber-200';      // Unconfirmed
    case 1:  return 'bg-blue-50 text-blue-700 ring-blue-200';         // Scheduled
    case 2:  return 'bg-violet-50 text-violet-700 ring-violet-200';   // In Progress
    case 3:
    case 5:  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';// Completed
    case 6:  return 'bg-rose-50 text-rose-700 ring-rose-200';         // Cancelled
    case 7:  return 'bg-slate-100 text-slate-700 ring-slate-200';     // Enquiry
    case 9:  return 'bg-slate-100 text-slate-700 ring-slate-200';     // Call Later
    case 10: return 'bg-primary-100 text-primary ring-primary/30';    // Revisit
    case 15: return 'bg-amber-50 text-amber-700 ring-amber-200';      // Awaiting Approval
    case 21: return 'bg-slate-100 text-slate-700 ring-slate-200';     // On Hold
    default: return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

function ageInDays(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function formatAppt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${day}, ${date}`;
}

export default function OrderHistoryPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to page 1 whenever tab/debouncedSearch/pageSize change
  useEffect(() => { setPage(1); }, [tab, debouncedQ, pageSize]);

  const currentTab = useMemo(() => TABS.find((t) => t.key === tab) ?? TABS[0], [tab]);
  const statuses = currentTab.statuses ?? null;

  // Build the URL declaratively — useFetch handles the fetch + abort lifecycle
  const fetchPath = useMemo(() => {
    const params = new URLSearchParams();
    if (statuses && statuses.length === 1) params.set('status', String(statuses[0]));
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    return `/jobs?${params}`;
  }, [statuses, debouncedQ, pageSize, page]);

  const { data, error, loading } = useFetch<{ items: Job[]; total: number }>(fetchPath);

  // Client-side narrow for tabs whose backend status filter is single-value
  // (Completed tab needs status 3 OR 5; backend only takes one at a time).
  const items = useMemo(() => {
    const rows = data?.items ?? [];
    if (statuses && statuses.length > 1) {
      return rows.filter((j) => statuses.includes(j.job_status));
    }
    return rows;
  }, [data, statuses]);
  const total = data?.total ?? items.length;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIdx = Math.min(page * pageSize, total);

  return (
    <div className="space-y-5">
      {/* Title + action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Order History</h1>
          <p className="text-sm text-slate-500">Track, manage, and review the orders raised for your account.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-outline" title="Raise an escalation (coming soon)">
            <AlertTriangle className="w-4 h-4 text-primary" /> Escalate
          </button>
          <button type="button" className="btn-outline" title="Bulk upload (coming soon)">
            <Upload className="w-4 h-4" /> Bulk Upload
          </button>
          <Link href="/export" className="btn-outline">
            <Download className="w-4 h-4" /> Export
          </Link>
          <Link href="/jobs/new" className="btn-primary" title="Raise a new technician booking">
            <Plus className="w-4 h-4" /> New Orders
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold transition border',
                isActive
                  ? t.key === 'all'
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                    : 'bg-primary-dark text-white border-primary-dark shadow-md shadow-primary-dark/30'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by Job ID, Ref ID, customer or mobile…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[140px]"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Ref ID</th>
              <th>Client Ref ID</th>
              <th>City</th>
              <th>Customer</th>
              <th>Appointment</th>
              <th>Status of Order</th>
              {currentTab.key === 'completed' && <th>Rating</th>}
              <th>Source</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={currentTab.key === 'completed' ? 10 : 9} className="text-center text-slate-500 py-8">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={currentTab.key === 'completed' ? 10 : 9} className="text-center text-slate-500 py-8">
                  No orders found.
                </td>
              </tr>
            )}
            {!loading && items.map((j) => {
              const age = ageInDays(j.requested_date_time);
              return (
                <tr key={j.job_id} className="hover:bg-primary-50/50">
                  <td>
                    <Link href={`/jobs/${j.job_id}`} className="text-primary hover:underline font-semibold inline-flex items-center gap-1">
                      #{j.job_id}
                      {j.is_escalated ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-label="Escalated" />
                      ) : null}
                    </Link>
                  </td>
                  <td className="text-xs font-mono">{j.job_reference_id || '—'}</td>
                  <td className="text-xs font-mono">{j.client_ref_id || '—'}</td>
                  <td>{j.city_name || '—'}</td>
                  <td>
                    <div className="text-slate-800">{j.customer_name || '—'}</div>
                    {j.customer_mob_no && (
                      <div className="text-xs text-slate-500">{j.customer_mob_no}</div>
                    )}
                  </td>
                  <td className="text-xs">{formatAppt(j.requested_date_time)}</td>
                  <td>
                    <span className={cn('badge ring-1', statusBadgeClass(j.job_status))}>
                      {STATUS_LABELS[j.job_status] || `Status ${j.job_status}`}
                    </span>
                  </td>
                  {currentTab.key === 'completed' && (
                    <td>
                      {j.rating ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500" />
                          <span className="text-xs font-semibold">{j.rating}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="text-xs">{j.source_type || '—'}</td>
                  <td className="text-xs">{age != null ? `${age} d` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Showing <span className="font-semibold">{firstIdx}</span>–
            <span className="font-semibold">{lastIdx}</span> of{' '}
            <span className="font-semibold">{total}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-outline disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5">
              Page <span className="font-semibold">{page}</span> of{' '}
              <span className="font-semibold">{pageCount}</span>
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="btn-outline disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
