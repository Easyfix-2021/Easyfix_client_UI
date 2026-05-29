'use client';

/*
 * My Order History — primary landing page after SPOC login.
 *
 * Replicates the legacy Angular_ClientDashboard dual-tab pattern:
 *  - "All Orders"           → no status filter
 *  - "Completed & Under Audit" → status=3 (Completed) + status=5 (Completed alt)
 *
 * Filter bar (parity with the Angular job-status-filter component):
 *  - Search (Job ID / Ref ID / customer / mobile)  — debounced 300ms
 *  - Ticket Created Date range  (startDate / endDate, dateType=created)
 *  - City multi-select          (cityIds, scoped to client's job cities)
 *  - Client Team multi-select   (ownerIds, from /team/members)
 *  - Bucket multi-select        (statuses CSV — only on the "All Orders" tab,
 *                                hidden on Completed to match legacy)
 *  - Apply / Reset buttons      — Apply commits the staged filter to the
 *                                fetch URL; Reset clears everything.
 *
 * Search + page-size are LIVE (no Apply needed). The heavier filters are
 * staged so the user can compose a query without firing a request per
 * checkbox toggle. Matches the legacy UX.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Upload, Download, AlertTriangle, Search,
  ChevronLeft, ChevronRight, Star, Filter, X,
} from 'lucide-react';
import { useFetch, useFetchOnce, useDebouncedValue } from '@/lib/hooks';
import { ApiError, downloadBlob } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { MultiSelect, type MultiSelectOption } from '@/components/multi-select';

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

// Bucket options shown on the "All Orders" tab. Each entry's `value`
// is the CSV of backend status codes — picking "Completed" sends
// statuses=3,5; picking multiple buckets concatenates their codes.
// Mirrors the legacy Angular Buckets list, trimmed to codes the Next.js
// STATUS_LABELS map already exposes.
const BUCKET_OPTIONS: MultiSelectOption<string>[] = [
  { value: '0',    label: 'Unconfirmed' },
  { value: '1',    label: 'Scheduled' },
  { value: '2',    label: 'In-Progress' },
  { value: '3,5',  label: 'Completed' },
  { value: '15',   label: 'Awaiting Approval' },
  { value: '21',   label: 'On Hold' },
  { value: '10',   label: 'Revisit' },
  { value: '9',    label: 'Call Later' },
  { value: '7',    label: 'Enquiry' },
  { value: '6',    label: 'Cancelled' },
];

function statusBadgeClass(status: number) {
  switch (status) {
    case 0:  return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 1:  return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 2:  return 'bg-violet-50 text-violet-700 ring-violet-200';
    case 3:
    case 5:  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 6:  return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 7:  return 'bg-slate-100 text-slate-700 ring-slate-200';
    case 9:  return 'bg-slate-100 text-slate-700 ring-slate-200';
    case 10: return 'bg-primary-100 text-primary ring-primary/30';
    case 15: return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 21: return 'bg-slate-100 text-slate-700 ring-slate-200';
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

// ─── Filter state ────────────────────────────────────────────────────
// Staged = what the user is composing in the filter bar.
// Applied = what's been committed to the fetch URL via Apply.
// Reset clears both.
type FilterState = {
  startDate: string;          // 'YYYY-MM-DD' or ''
  endDate: string;
  cityIds: number[];
  ownerIds: number[];
  bucketValues: string[];     // CSV chunks from BUCKET_OPTIONS, e.g. ['0','3,5']
};

const EMPTY_FILTERS: FilterState = {
  startDate: '', endDate: '',
  cityIds: [], ownerIds: [], bucketValues: [],
};

function filtersDiffer(a: FilterState, b: FilterState) {
  if (a.startDate !== b.startDate || a.endDate !== b.endDate) return true;
  if (a.cityIds.length !== b.cityIds.length) return true;
  if (a.ownerIds.length !== b.ownerIds.length) return true;
  if (a.bucketValues.length !== b.bucketValues.length) return true;
  // Order doesn't matter for these arrays but we keep them stable; a
  // shallow positional check is good enough since the only mutations
  // come through MultiSelect's append/remove logic.
  if (a.cityIds.some((id, i) => id !== b.cityIds[i])) return true;
  if (a.ownerIds.some((id, i) => id !== b.ownerIds[i])) return true;
  if (a.bucketValues.some((v, i) => v !== b.bucketValues[i])) return true;
  return false;
}

export default function OrderHistoryPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [staged, setStaged] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  // Reset page-1 whenever any committed filter or search changes.
  useEffect(() => { setPage(1); }, [tab, debouncedQ, pageSize, applied]);

  // When switching to "Completed" tab, the Bucket dropdown is hidden
  // (legacy parity). Clear any staged bucket selections to avoid them
  // sneaking back when the user swings back to "All Orders".
  useEffect(() => {
    if (tab === 'completed' && staged.bucketValues.length > 0) {
      setStaged((s) => ({ ...s, bucketValues: [] }));
    }
  }, [tab, staged.bucketValues.length]);

  const currentTab = useMemo(() => TABS.find((t) => t.key === tab) ?? TABS[0], [tab]);

  // Lookups for City / Client Team dropdowns. useFetchOnce is fine —
  // these are bootstrap loads, not reactive on user input.
  const cityLookup = useFetchOnce<{ items: { id: number; name: string }[] }>('/lookup/cities');
  const teamLookup = useFetchOnce<{ items: { id: number; name: string }[] }>('/team/members');

  const cityOptions: MultiSelectOption<number>[] = useMemo(
    () => (cityLookup.data?.items ?? []).map((c) => ({ value: c.id, label: c.name || `City #${c.id}` })),
    [cityLookup.data]
  );
  const teamOptions: MultiSelectOption<number>[] = useMemo(
    () => (teamLookup.data?.items ?? []).map((u) => ({ value: u.id, label: u.name || `User #${u.id}` })),
    [teamLookup.data]
  );

  // Compose the fetch URL from `applied` (committed) filters + the
  // tab's status set. Buckets and tab statuses combine: Completed tab
  // ALWAYS sends 3,5; All Orders tab sends whatever buckets the user
  // picked (or omits the param entirely).
  const fetchPath = useMemo(() => {
    const params = new URLSearchParams();

    if (currentTab.statuses) {
      params.set('statuses', currentTab.statuses.join(','));
    } else if (applied.bucketValues.length > 0) {
      // Flatten ['0','3,5'] → '0,3,5'
      const flat = applied.bucketValues.flatMap((v) => v.split(',')).join(',');
      if (flat) params.set('statuses', flat);
    }

    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    if (applied.startDate) params.set('startDate', applied.startDate);
    if (applied.endDate)   params.set('endDate',   applied.endDate);
    if (applied.cityIds.length)  params.set('cityIds',  applied.cityIds.join(','));
    if (applied.ownerIds.length) params.set('ownerIds', applied.ownerIds.join(','));
    params.set('dateType', 'created');
    params.set('limit',  String(pageSize));
    params.set('offset', String((page - 1) * pageSize));
    return `/jobs?${params}`;
  }, [currentTab, applied, debouncedQ, pageSize, page]);

  const { data, error, loading } = useFetch<{ items: Job[]; total: number }>(fetchPath);

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIdx = Math.min(page * pageSize, total);

  const hasStagedChanges = filtersDiffer(staged, applied);
  const hasAnyApplied =
    applied.startDate || applied.endDate ||
    applied.cityIds.length || applied.ownerIds.length || applied.bucketValues.length;

  function applyFilters() { setApplied(staged); }
  function resetFilters() {
    setStaged(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setQ('');
  }

  // ─── Export to Excel ────────────────────────────────────────────────
  // Migrated from legacy ACD_APIs `POST /api/jobs/exportToExcel/{clientId}`.
  // The new endpoint accepts the same filter set as the list call, so we
  // simply reuse the applied filters + tab + search and download.
  //
  // Legacy guards (job-status-header.component.ts:122-143) preserved:
  //   1. Both startDate AND endDate must be set in the APPLIED filter
  //      (staged-but-not-applied doesn't count — would mismatch the
  //      spreadsheet contents).
  //   2. Range must be ≤ 60 days. Larger windows used to OOM the legacy
  //      POI workbook; the new xlsx lib handles it fine but the cap is
  //      a sensible product guardrail anyway.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Pre-computed enable state — drives the button's disabled prop AND
  // its tooltip so the user knows WHY it's disabled before clicking.
  const exportGate = useMemo(() => {
    if (!applied.startDate || !applied.endDate) {
      return { ok: false, reason: 'Pick a date range (both From and To) and click Apply Filter to enable export.' };
    }
    const ms = new Date(applied.endDate).getTime() - new Date(applied.startDate).getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days > 60) {
      return { ok: false, reason: `Date range is ${days} days. Maximum allowed is 60 days — narrow the range and Apply again.` };
    }
    return { ok: true, reason: '' };
  }, [applied.startDate, applied.endDate]);

  async function handleExport() {
    // Belt-and-braces — the button is disabled when !exportGate.ok, but
    // re-checking inside the handler protects against form-submit /
    // keyboard-Enter paths and surfaces the same message inline.
    if (!exportGate.ok) {
      setExportError(exportGate.reason);
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (currentTab.statuses) {
        params.set('statuses', currentTab.statuses.join(','));
      } else if (applied.bucketValues.length > 0) {
        const flat = applied.bucketValues.flatMap((v) => v.split(',')).join(',');
        if (flat) params.set('statuses', flat);
      }
      if (debouncedQ.trim())        params.set('q', debouncedQ.trim());
      params.set('startDate', applied.startDate);
      params.set('endDate',   applied.endDate);
      if (applied.cityIds.length)   params.set('cityIds',   applied.cityIds.join(','));
      if (applied.ownerIds.length)  params.set('ownerIds',  applied.ownerIds.join(','));
      params.set('dateType', 'created');
      const ts = new Date().toISOString().slice(0, 10);
      await downloadBlob(`/export/jobs?${params}`, `OrderHistory_${ts}.xlsx`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

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
          <Link href="/jobs/upload" className="btn-outline" title="Bulk-upload orders via .xlsx">
            <Upload className="w-4 h-4" /> Bulk Upload
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !exportGate.ok}
            className="btn-outline disabled:cursor-not-allowed disabled:opacity-60"
            title={exportGate.ok
              ? 'Download the current filtered view as Excel (max 60-day range)'
              : exportGate.reason}
          >
            <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export'}
          </button>
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
      <div className="card p-3 space-y-3">
        {/* Row 1 — quick search + per-page (LIVE, no Apply needed) */}
        <div className="flex flex-wrap items-center gap-3">
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

        {/* Row 2 — staged filters (Apply / Reset commits) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* Ticket Created Date range — native <input type="date"> pair,
              no extra library. Empty string clears the filter. */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ticket Created — From</label>
            <input
              type="date"
              className="input"
              value={staged.startDate}
              max={staged.endDate || undefined}
              onChange={(e) => setStaged((s) => ({ ...s, startDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ticket Created — To</label>
            <input
              type="date"
              className="input"
              value={staged.endDate}
              min={staged.startDate || undefined}
              onChange={(e) => setStaged((s) => ({ ...s, endDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
            <MultiSelect
              label="All Cities"
              options={cityOptions}
              value={staged.cityIds}
              onChange={(v) => setStaged((s) => ({ ...s, cityIds: v }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Client Team</label>
            <MultiSelect
              label="All Members"
              options={teamOptions}
              value={staged.ownerIds}
              onChange={(v) => setStaged((s) => ({ ...s, ownerIds: v }))}
            />
          </div>

          {/* Bucket — All Orders tab only. On Completed tab the column
              is hidden because the tab itself fixes the status to 3+5. */}
          {tab === 'all' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bucket</label>
              <MultiSelect
                label="All Buckets"
                options={BUCKET_OPTIONS}
                value={staged.bucketValues}
                onChange={(v) => setStaged((s) => ({ ...s, bucketValues: v }))}
              />
            </div>
          )}
        </div>

        {/* Row 3 — Apply / Reset action row */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {hasAnyApplied ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Filter className="w-3.5 h-3.5" /> Filters active
              </span>
            ) : (
              <span>No filters applied</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="btn-outline"
              disabled={!hasAnyApplied && !hasStagedChanges && !q}
              title="Clear all filters"
            >
              <X className="w-4 h-4" /> Reset
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="btn-primary"
              disabled={!hasStagedChanges}
              title="Apply staged filters"
            >
              <Filter className="w-4 h-4" /> Apply Filter
            </button>
          </div>
        </div>
      </div>

      {(error || exportError) && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {exportError || error}
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
