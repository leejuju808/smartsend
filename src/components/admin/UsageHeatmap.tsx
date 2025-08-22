'use client'
import React from 'react'

type Cell = { kind: string; day: string; value: number }

function intensity(v: number, max: number) {
  if (max <= 0) return 'bg-slate-100'
  const r = Math.min(1, v / max)
  // Map to 5 buckets for clear contrast
  if (r === 0) return 'bg-slate-100'
  if (r < 0.2) return 'bg-emerald-50'
  if (r < 0.4) return 'bg-emerald-100'
  if (r < 0.6) return 'bg-emerald-200'
  if (r < 0.8) return 'bg-emerald-300'
  return 'bg-emerald-400'
}

export default function UsageHeatmap({
  days,
  kinds,
  cells,
}: {
  days: string[]
  kinds: string[]
  cells: Cell[]
}) {
  const byKey = new Map<string, number>()
  let max = 0
  for (const c of cells) {
    const key = `${c.kind}|${c.day}`
    byKey.set(key, c.value)
    if (c.value > max) max = c.value
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, 1fr)` }}>
          {/* Header row */}
          <div className="px-2 py-2 text-xs text-slate-500">Kind → / Day ↓</div>
          {days.map(d => (
            <div key={d} className="px-2 py-2 text-[10px] text-slate-500 text-center">{d.slice(5)}</div>
          ))}
          {/* Rows */}
          {kinds.map(k => (
            <React.Fragment key={k}>
              <div className="px-2 py-1 text-xs font-medium text-slate-700 whitespace-nowrap">{k}</div>
              {days.map(d => {
                const v = byKey.get(`${k}|${d}`) || 0
                return (
                  <div key={`${k}-${d}`} className={`h-6 border ${intensity(v, max)}`} title={`${k} · ${d} · ${v}`} />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
