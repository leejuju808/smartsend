import React from 'react';

type Health = {
  time: string;
  uptime_seconds: number;
  envPresence: Record<string, boolean>;
  checks: Record<string, { ok: boolean; note?: string }>;
};

async function getHealth(): Promise<Health> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/health`, { cache: 'no-store' })
    .catch(() => null);
  // Fallback to relative (works in dev & most prod setups)
  const safeRes = res && res.ok ? res : await fetch('/api/health', { cache: 'no-store' });
  return safeRes.json();
}

export default async function StatusPage() {
  const data = await getHealth();

  const pill = (ok: boolean) => (
    <span className={`px-2 py-1 rounded-full text-xs ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? 'OK' : 'FAIL'}
    </span>
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">System Status</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-xl">
          <div className="text-sm text-gray-500">Server time</div>
          <div className="font-mono">{data.time}</div>
          <div className="text-sm text-gray-500 mt-2">Uptime (s)</div>
          <div className="font-mono">{data.uptime_seconds}</div>
        </div>

        <div className="p-4 border rounded-xl">
          <div className="font-semibold mb-2">Live Checks</div>
          <ul className="space-y-2">
            {Object.entries(data.checks).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between">
                <span className="font-mono">{k}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{v.note ?? ''}</span>
                  {pill(v.ok)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 border rounded-xl">
        <div className="font-semibold mb-2">Environment Presence</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(data.envPresence).map(([k, ok]) => (
            <div key={k} className="flex items-center justify-between border rounded-lg px-3 py-2">
              <span className="font-mono text-sm">{k}</span>
              {pill(ok)}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Secrets are not shown; this only indicates whether each variable is set.
        </p>
      </div>
    </div>
  );
} 