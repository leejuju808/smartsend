"use client"

export function EmailKpis({ totals }: { totals?: { sent?: number; opened?: number; clicked?: number } }) {
  const sent = totals?.sent ?? 0
  const opened = totals?.opened ?? 0
  const clicked = totals?.clicked ?? 0
  const orate = sent ? Math.round((opened / sent) * 100) : 0
  const crate = sent ? Math.round((clicked / sent) * 100) : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="p-4 rounded-2xl border">
        <div className="text-xs text-muted-foreground">Sent</div>
        <div className="text-2xl font-semibold">{sent}</div>
      </div>
      <div className="p-4 rounded-2xl border">
        <div className="text-xs text-muted-foreground">Opened</div>
        <div className="text-2xl font-semibold">{opened}</div>
      </div>
      <div className="p-4 rounded-2xl border">
        <div className="text-xs text-muted-foreground">Clicked</div>
        <div className="text-2xl font-semibold">{clicked}</div>
      </div>
      <div className="p-4 rounded-2xl border">
        <div className="text-xs text-muted-foreground">Open / Click Rate</div>
        <div className="text-2xl font-semibold">{orate}% / {crate}%</div>
      </div>
    </div>
  )
}

