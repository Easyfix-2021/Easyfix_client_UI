'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, getToken, setToken } from '@/lib/api';
import { LayoutDashboard, Briefcase, FileSpreadsheet, User as UserIcon, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

type Spoc = { id: number; contact_name: string; client_id: number };

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [spoc, setSpoc] = useState<Spoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push('/'); return; }
    (async () => {
      try {
        const res = await api.get<{ spoc: Spoc }>('/me');
        setSpoc(res.spoc);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null); router.push('/');
        }
      } finally { setLoading(false); }
    })();
  }, [router]);

  async function logout() {
    // Clear the httpOnly cookie server-side (shared logout clears every
    // known auth cookie name) AND wipe the Bearer token from localStorage.
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); }
    catch { /* network failure is ok — we still wipe local state */ }
    setToken(null);
    router.push('/');
  }

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/jobs',      label: 'Jobs',      icon: Briefcase },
    { href: '/export',    label: 'Export',    icon: FileSpreadsheet },
    { href: '/profile',   label: 'Profile',   icon: UserIcon },
  ];

  if (loading) return <main className="p-8 text-center text-slate-500">Loading…</main>;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <h1 className="text-xl font-bold">EasyFix</h1>
          <p className="text-xs text-slate-400">Client Portal</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {nav.map((n) => {
            const active = pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded text-sm',
                  active ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <Icon className="w-4 h-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-slate-800 text-sm">
          <div className="font-medium truncate">{spoc?.contact_name}</div>
          <div className="text-xs text-slate-400">Client #{spoc?.client_id}</div>
          <button onClick={logout} className="mt-2 flex items-center gap-1 text-xs text-slate-300 hover:text-white">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
