'use client'

import useSWR from 'swr'

export default function CampaignMetrics({ campaignId }: { campaignId: string }) {
  const { data } = useSWR(`/api/campaigns/${campaignId}/metrics`, (u)=>fetch(u).then(r=>r.json()))
  const opens = data?.opens ?? 0
  const clicks = data?.clicks ?? 0
  const sent   = data?.sent   ?? 0
  const or = sent ? Math.round((opens / sent) * 100) : 0
  const cr = sent ? Math.round((clicks / sent) * 100) : 0

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-muted-foreground">Sent</div>
        <div className="text-2xl font-semibold">{sent}</div>
      </div>
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-muted-foreground">Opens</div>
        <div className="text-2xl font-semibold">{opens} <span className="text-sm">({or}%)</span></div>
      </div>
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-muted-foreground">Clicks</div>
        <div className="text-2xl font-semibold">{clicks} <span className="text-sm">({cr}%)</span></div>
      </div>
    </div>
  )
}
