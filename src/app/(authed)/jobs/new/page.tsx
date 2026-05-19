'use client';

/*
 * "Book a technician" — replicates the legacy Angular_ClientDashboard
 * /job/book-job page in the new red/white theme.
 *
 * Backend wiring (all under /api/client/*):
 *   GET  /me                       → SPOC profile (client_id, contact_name)
 *   GET  /lookup/service-categories→ categories contracted for this tenant
 *   GET  /me/custom-properties     → per-tenant dynamic extra fields
 *   POST /jobs                     → create the booking
 *
 * Photo/video upload mirrors the legacy two-stage flow (create job first,
 * then attach files) — the UI captures handles, actual upload is deferred
 * until /jobs/<id>/files lands.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Image as ImageIcon, AlertCircle, Sparkles,
  ChevronDown, Search, Check, Loader2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSpoc } from '@/lib/spoc-context';

type ServiceCategory = { id: number; name: string };
type CustomProperty = { name: string; label: string | null; mandatory: boolean };

type FormState = {
  customer_mob_no: string;
  customer_name: string;
  alternate_name: string;
  alternate_mob_no: string;
  service_category_ids: number[];
  job_desc: string;
  job_types: { Installation: boolean; Repair: boolean; 'Un-Installation': boolean };
  payment: 'paid' | 'free' | '';
  address: string;
  client_ref_id: string;
  notes: string;
  custom_props: Record<string, string>;
};

const EMPTY: FormState = {
  customer_mob_no: '',
  customer_name: '',
  alternate_name: '',
  alternate_mob_no: '',
  service_category_ids: [],
  job_desc: '',
  job_types: { Installation: false, Repair: false, 'Un-Installation': false },
  payment: '',
  address: '',
  client_ref_id: '',
  notes: '',
  custom_props: {},
};

function firstNameOf(full?: string): string {
  if (!full) return '';
  return full.trim().split(/\s+/)[0] ?? '';
}

function humanize(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function isTenDigits(v: string) {
  return /^[6-9]\d{9}$/.test(v.trim());
}

export default function NewOrderPage() {
  const router = useRouter();
  const spoc = useSpoc(); // Layout-provided; no extra /me fetch
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [customProps, setCustomProps] = useState<CustomProperty[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [showAltModal, setShowAltModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const bootedRef = useRef(false);

  // Bootstrap: load categories + custom props in parallel. Ref-guarded so
  // Strict Mode's dev-only double-mount doesn't refire the fetches.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      const results = await Promise.allSettled([
        api.get<{ items: ServiceCategory[] }>('/lookup/service-categories'),
        api.get<{ items: CustomProperty[] }>('/me/custom-properties'),
      ]);

      if (results[0].status === 'rejected' && results[1].status === 'rejected') {
        setBootError('Unable to load order form data. Please refresh.');
      }
      setCategories(
        results[0].status === 'fulfilled' ? results[0].value.items ?? [] : []
      );
      setCustomProps(
        results[1].status === 'fulfilled' ? results[1].value.items ?? [] : []
      );
      setBootstrapped(true);
    })();
  }, []);

  const altSummary = useMemo(() => {
    if (!form.alternate_mob_no && !form.alternate_name) return null;
    return `${form.alternate_name || '—'} · ${form.alternate_mob_no || '—'}`;
  }, [form.alternate_mob_no, form.alternate_name]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => { const { [key]: _, ...rest } = e; return rest; });
  }

  function toggleJobType(t: keyof FormState['job_types']) {
    setForm((f) => ({ ...f, job_types: { ...f.job_types, [t]: !f.job_types[t] } }));
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((cur) => [...cur, ...picked]);
    e.target.value = '';
  }

  function removeFile(i: number) {
    setFiles((cur) => cur.filter((_, idx) => idx !== i));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.customer_mob_no.trim()) errs.customer_mob_no = 'Mobile number is required';
    else if (!isTenDigits(form.customer_mob_no)) errs.customer_mob_no = 'Enter a valid 10-digit mobile';
    if (!form.customer_name.trim()) errs.customer_name = 'Contact name is required';
    if (form.service_category_ids.length === 0) errs.service_category_ids = 'Pick at least one service category';
    if (!form.job_desc.trim()) errs.job_desc = 'Describe the problem';
    if (!form.address.trim()) errs.address = 'Address is required';
    if (!form.client_ref_id.trim()) errs.client_ref_id = "Brand's order reference ID is required";
    if (form.alternate_mob_no && !isTenDigits(form.alternate_mob_no)) {
      errs.alternate_mob_no = 'Enter a valid 10-digit alternate mobile';
    }
    customProps.forEach((cp) => {
      if (cp.mandatory && !(form.custom_props[cp.name] ?? '').trim()) {
        errs[`cp_${cp.name}`] = `${cp.label || humanize(cp.name)} is required`;
      }
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const job_types = (Object.keys(form.job_types) as Array<keyof FormState['job_types']>)
        .filter((k) => form.job_types[k]);

      const payload = {
        customer_name: form.customer_name.trim(),
        customer_mob_no: form.customer_mob_no.trim(),
        alternate_name: form.alternate_name.trim() || undefined,
        alternate_mob_no: form.alternate_mob_no.trim() || undefined,
        service_category_ids: form.service_category_ids,
        job_desc: form.job_desc.trim(),
        job_type: job_types.length ? job_types.join(',') : undefined,
        is_free_for_customer: form.payment === 'free',
        address: form.address.trim(),
        client_ref_id: form.client_ref_id.trim(),
        notes: form.notes.trim() || undefined,
        custom_properties: customProps
          .map((cp) => ({ name: cp.name, value: form.custom_props[cp.name] ?? '' }))
          .filter((p) => p.value.length > 0),
      };

      const res = await api.post<{ job_id: number }>('/jobs', payload);

      if (files.length && res?.job_id) {
        console.info(
          `[new-order] job #${res.job_id} created; ${files.length} file(s) await upload (endpoint pending).`
        );
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(EMPTY);
    setFiles([]);
    setFieldErrors({});
    setError(null);
  }

  // ── Render ────────────────────────────────────────────────────────
  if (!bootstrapped) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-3 text-sm">Loading your order form…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-rose-600">
        <AlertCircle className="w-8 h-8" />
        <p className="mt-3 text-sm">{bootError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Hello {firstNameOf(spoc.contact_name) || 'there'}
        </h1>
        <p className="text-sm text-slate-500">Book a technician and we will get your work done.</p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* Section 1 — Service Location & Contact Person */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">
            Service Location &amp; Contact Person
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Contact's mobile number"
              required
              error={fieldErrors.customer_mob_no}
            >
              <input
                className={cn('input', fieldErrors.customer_mob_no && 'ring-1 ring-rose-300')}
                inputMode="numeric"
                maxLength={10}
                value={form.customer_mob_no}
                onChange={(e) => setField('customer_mob_no', e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile"
              />
            </Field>

            <Field
              label="Name of person for coordination with Technician"
              required
              error={fieldErrors.customer_name}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowAltModal(true)}
                  className="text-primary hover:underline text-sm font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  {altSummary ? 'Edit Alternate' : 'Add Alternate Mobile No.'}
                </button>
              }
            >
              <input
                className={cn('input', fieldErrors.customer_name && 'ring-1 ring-rose-300')}
                value={form.customer_name}
                onChange={(e) => setField('customer_name', e.target.value)}
                placeholder="Contact person's name"
              />
              {altSummary && (
                <p className="mt-1 text-xs text-slate-500">Alternate: {altSummary}</p>
              )}
            </Field>

            <Field
              label="Service Category"
              required
              error={fieldErrors.service_category_ids}
            >
              <MultiSelect
                options={categories}
                selectedIds={form.service_category_ids}
                onChange={(ids) => setField('service_category_ids', ids)}
                placeholder={
                  categories.length === 0
                    ? 'No categories configured for your account'
                    : 'Select one or more categories'
                }
                disabled={categories.length === 0}
                hasError={!!fieldErrors.service_category_ids}
              />
            </Field>

            <Field
              label="Describe the problem. What needs to be done?"
              required
              error={fieldErrors.job_desc}
            >
              <textarea
                rows={3}
                className={cn('input', fieldErrors.job_desc && 'ring-1 ring-rose-300')}
                value={form.job_desc}
                onChange={(e) => setField('job_desc', e.target.value)}
                placeholder="e.g. AC stops cooling after 20 minutes, water leaking near the indoor unit."
              />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Job Type
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(['Installation', 'Repair', 'Un-Installation'] as const).map((t) => (
                  <label key={t} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded text-primary focus:ring-primary"
                      checked={form.job_types[t]}
                      onChange={() => toggleJobType(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Payment
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {([
                  ['paid', 'Paid By Customer'],
                  ['free', 'Free for Customer'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="payment"
                      className="text-primary focus:ring-primary"
                      checked={form.payment === k}
                      onChange={() => setField('payment', k)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {customProps.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Custom Properties
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {customProps.map((cp) => (
                  <Field
                    key={cp.name}
                    label={cp.label || humanize(cp.name)}
                    required={cp.mandatory}
                    error={fieldErrors[`cp_${cp.name}`]}
                  >
                    <input
                      className={cn('input', fieldErrors[`cp_${cp.name}`] && 'ring-1 ring-rose-300')}
                      value={form.custom_props[cp.name] ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, custom_props: { ...f.custom_props, [cp.name]: e.target.value } }))
                      }
                      placeholder={cp.label || humanize(cp.name)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Section 2 — Address */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Address</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Address for Technician"
              required
              error={fieldErrors.address}
            >
              <textarea
                rows={3}
                className={cn('input', fieldErrors.address && 'ring-1 ring-rose-300')}
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="Location for technician visit"
              />
            </Field>

            <Field
              label="Brand's order reference ID"
              required
              error={fieldErrors.client_ref_id}
            >
              <input
                className={cn('input', fieldErrors.client_ref_id && 'ring-1 ring-rose-300')}
                value={form.client_ref_id}
                onChange={(e) => setField('client_ref_id', e.target.value)}
                placeholder="Your internal order or ticket reference"
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Anything you want the technician to keep in mind?">
                <textarea
                  rows={3}
                  className="input"
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Special instructions for the technician (parking, gate code, customer preferences, etc.)"
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Photos and Video of work to be done">
                <div className="rounded border-2 border-dashed border-slate-200 p-4">
                  {files.length === 0 ? (
                    <p className="text-sm text-slate-500">No files attached yet.</p>
                  ) : (
                    <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-primary-50 text-primary text-xs"
                        >
                          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate flex-1" title={f.name}>{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            aria-label={`Remove ${f.name}`}
                            className="hover:text-rose-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="mt-3 inline-flex items-center gap-1 text-primary hover:underline text-sm font-semibold cursor-pointer">
                    <Plus className="w-4 h-4" />
                    Add files
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={onPickFiles}
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-400">
                    Images and videos help the technician prepare. Files attach to the order after it&apos;s created.
                  </p>
                </div>
              </Field>
            </div>
          </div>
        </section>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="text-sm text-slate-600 hover:text-primary underline-offset-2 hover:underline"
          >
            Reset
          </button>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="btn-outline">Cancel</Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Booking…' : 'Book Now'}
            </button>
          </div>
        </div>
      </form>

      {showAltModal && (
        <AlternateModal
          name={form.alternate_name}
          number={form.alternate_mob_no}
          error={fieldErrors.alternate_mob_no}
          onClose={() => setShowAltModal(false)}
          onSave={(name, number) => {
            setField('alternate_name', name);
            setField('alternate_mob_no', number);
            setShowAltModal(false);
          }}
        />
      )}
    </div>
  );
}

function Field({
  label, required, error, trailing, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label} {required && <span className="text-primary">*</span>}
        </label>
        {trailing}
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function MultiSelect({
  options, selectedIds, onChange, placeholder, disabled, hasError,
}: {
  options: ServiceCategory[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click-outside / Escape
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.id)),
    [options, selectedSet]
  );

  function toggle(id: number) {
    if (selectedSet.has(id)) onChange(selectedIds.filter((s) => s !== id));
    else onChange([...selectedIds, id]);
  }

  function remove(id: number) {
    onChange(selectedIds.filter((s) => s !== id));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          'input flex items-center gap-1.5 flex-wrap text-left min-h-[38px]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          hasError && 'ring-1 ring-rose-300'
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-slate-400 flex-1">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-100 text-primary text-xs font-medium"
              >
                {o.name}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); remove(o.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); remove(o.id); } }}
                  aria-label={`Remove ${o.name}`}
                  className="hover:text-primary-dark cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-30 top-full left-0 right-0 mt-1 rounded-md border border-slate-200 bg-white shadow-lg max-h-72 flex flex-col"
        >
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                className="w-full text-sm rounded border border-slate-200 pl-7 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search categories…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <ul className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500 text-center">No matches</li>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-primary-50',
                        checked && 'bg-primary-50 text-primary font-semibold'
                      )}
                    >
                      <span
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          checked ? 'bg-primary border-primary text-white' : 'border-slate-300'
                        )}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span className="flex-1">{o.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {selectedIds.length > 0 && (
            <div className="border-t border-slate-100 px-3 py-2 flex items-center justify-between text-xs text-slate-500">
              <span>{selectedIds.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-primary hover:underline font-semibold"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlternateModal({
  name: initialName, number: initialNumber, error, onClose, onSave,
}: {
  name: string;
  number: string;
  error?: string;
  onClose: () => void;
  onSave: (name: string, number: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState(initialNumber);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Add Alternate Number</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
              Alternate Contact Name
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
              Alternate Contact No.
            </label>
            <input
              className={cn('input', error && 'ring-1 ring-rose-300')}
              inputMode="numeric"
              maxLength={10}
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="10-digit mobile"
            />
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button
            type="button"
            onClick={() => onSave(name.trim(), number.trim())}
            className="btn-primary"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
