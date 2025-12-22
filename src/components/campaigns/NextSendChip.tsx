'use client';

import { useEffect, useState } from 'react';
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Preview = {
  campaign_id: string;
  lead_id: string;
  step_no: number;
  tz: string;
  window_start: string | null;
  window_end: string | null;
  business_days_only: boolean;
  holiday_region: string | null;
  scheduled_at_earliest: string;
  scheduled_at_latest: string;
};

export function NextSendChip({
  campaignId,
  leadId,
  stepNo,
  includeJitter = false,
  base,
}: {
  campaignId: string;
  leadId?: string;
  stepNo: number;
  includeJitter?: boolean;
  base?: string;
}) {
  const [p, setP] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [effectiveLeadId, setEffectiveLeadId] = useState<string | null>(leadId || null);

  // Fetch first lead if no leadId provided
  useEffect(() => {
    if (!effectiveLeadId && campaignId) {
      fetch(`/api/campaigns/${campaignId}/leads/basic?limit=1`)
        .then((r) => r.json())
        .then((j) => {
          if (j.leads && j.leads.length > 0) {
            setEffectiveLeadId(j.leads[0].id);
          }
        })
        .catch(() => {
          // Ignore errors
        });
    }
  }, [campaignId, effectiveLeadId]);

  async function fetchPreview() {
    if (!effectiveLeadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preview-send-window`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lead_id: effectiveLeadId,
          step_no: stepNo,
          include_jitter: includeJitter,
          base,
        }),
      });
      if (res.ok) {
        const j = await res.json();
        setP(j.preview ?? null);
      } else {
        const j = await res.json();
        console.error('Preview fetch error:', j.error);
      }
    } catch (e) {
      console.error('Preview fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (effectiveLeadId && campaignId && stepNo) {
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, effectiveLeadId, stepNo, includeJitter, base]);

  if (!effectiveLeadId) {
    return (
      <Card className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        No lead available
      </Card>
    );
  }

  if (!p) {
    return (
      <Card className="inline-flex items-center gap-2 px-3 py-2 text-sm">
        {loading ? 'Calculating…' : 'No data'}
      </Card>
    );
  }

  const earliest = new Date(p.scheduled_at_earliest);
  const latest = new Date(p.scheduled_at_latest);
  const hasRange = earliest.getTime() !== latest.getTime();

  const tooltipText = [
    `TZ: ${p.tz}`,
    p.business_days_only ? '· Biz days' : '',
    p.window_start && p.window_end ? `· Window ${p.window_start}-${p.window_end}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card className="inline-flex items-center gap-3 px-3 py-2 text-sm" title={tooltipText}>
      <div className="font-medium">Next send</div>
      <div>
        {earliest.toLocaleString()}
        {hasRange ? ` → ${latest.toLocaleTimeString()}` : ''}
      </div>
      <Button size="sm" variant="outline" onClick={fetchPreview} disabled={loading}>
        {loading ? '…' : 'Recalc'}
      </Button>
    </Card>
  );
}

