'use client'
import React, { useEffect, useState } from 'react'

type KindRow = { kind: string; today: number; week: number }
type Summary = { ok: boolean; kinds: KindRow[]; total: { today: number; week: number } }

export default function UsageDropdown() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/usage/summary', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: Summary) => { if (alive) { setData(j); setLoading(false) }})
      .catch(() => alive && setLoading(false))
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-usage-dd]')) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => { alive = false; document.removeEventListener('click', onDoc) }
  }, [])

  return (
    <div className="relative" data-usage-dd>
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-lg border px-3 py-2 text-sm"
        aria-expanded={open}
      >
        Usage
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-white shadow-lg z-50">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Your usage</div>
              <div className="text-xs text-slate-500">
                {loading ? 'loading…' : data ? `Today: ${data.total.today} · 7d: ${data.total.week}` : '—'}
              </div>
            </div>
            <div className="mt-2 rounded border">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">Kind</th>
                    <th className="px-2 py-1 text-left">Today</th>
                    <th className="px-2 py-1 text-left">7d</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.kinds || []).map(k => (
                    <tr key={k.kind}>
                      <td className="px-2 py-1">{k.kind}</td>
                      <td className="px-2 py-1">{k.today}</td>
                      <td className="px-2 py-1">{k.week}</td>
                    </tr>
                  ))}
                  {(!data || data.kinds.length === 0) && !loading ? (
                    <tr><td className="px-2 py-2 text-slate-500" colSpan={3}>No usage yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <a className="rounded-lg border px-2 py-1 text-xs" href="/dashboard/usage">Open usage</a>
              <a className="rounded-lg border px-2 py-1 text-xs" href="/api/usage/export?range=today">Export today</a>
              <a className="rounded-lg border px-2 py-1 text-xs" href="/api/usage/export?range=7d">Export 7d</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
