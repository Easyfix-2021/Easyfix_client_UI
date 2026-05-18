'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Stats = {
  open: number; scheduled: number; inProgress: number;
  completed: number; cancelled: number; total: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setStats(await api.get<Stats>('/dashboard')); }
      catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); }
    })();
  }, []);

  const cards = [
    { key: 'open',       label: 'Open',        color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { key: 'scheduled',  label: 'Scheduled',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { key: 'inProgress', label: 'In Progress', color: 'bg-violet-50 text-violet-700 border-violet-200' },
    { key: 'completed',  label: 'Completed',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { key: 'cancelled',  label: 'Cancelled',   color: 'bg-rose-50 text-rose-700 border-rose-200' },
    { key: 'total',      label: 'Total',       color: 'bg-slate-100 text-slate-700 border-slate-200' },
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`card p-4 border ${c.color}`}>
            <div className="text-xs font-medium opacity-80">{c.label}</div>
            <div className="text-3xl font-bold mt-1">
              {stats ? Number(stats[c.key] ?? 0) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
