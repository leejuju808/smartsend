"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function GuardBanner({ campaignId, role }: { campaignId: string; role: "owner" | "editor" | "viewer" | null }) {
  const [state, setState] = useState<{ paused: boolean; reason: string | null; health: any | null }>({ 
    paused: false, 
    reason: null, 
    health: null 
  });

  useEffect(() => {
    (async () => {
      try {
        // Fetch campaign data and health metrics
        const [campaignRes, healthRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}`).then(r => r.json()).catch(() => ({ campaign: null })),
          fetch(`/api/metrics/outbound?range=7d&campaign_id=${campaignId}`).then(r => r.json()).catch(() => ({ rows: [] }))
        ]);

        const campaign = campaignRes?.campaign || campaignRes;
        const { rows } = healthRes || { rows: [] };

        // Summarize locally
        const agg = rows.reduce((a: any, r: any) => ({
          sent: a.sent + (r.sent || 0),
          bounces: a.bounces + (r.bounces || 0),
          spams: a.spams + (r.spams || 0)
        }), { sent: 0, bounces: 0, spams: 0 });

        const br = agg.sent ? agg.bounces / agg.sent : 0;
        const sr = agg.sent ? agg.spams / agg.sent : 0;

        setState({
          paused: !!campaign?.paused_by_guard,
          reason: campaign?.pause_reason ?? null,
          health: { sent: agg.sent, br, sr }
        });
      } catch (error) {
        console.error("Failed to load guard banner state:", error);
      }
    })();
  }, [campaignId]);

  async function act(action: "resume" | "pause") {
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/guard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!r.ok) {
        const error = await r.json().catch(() => ({ error: "Action failed" }));
        alert(error.error || "Action failed");
      } else {
        // Reload to refresh state
        window.location.reload();
      }
    } catch (error) {
      console.error("Guard action failed:", error);
      alert("Action failed");
    }
  }

  if (!state.paused) return null;

  return (
    <Card className="p-3 border-red-500/40 bg-red-500/5">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <b>Campaign paused by Deliverability Guard</b>
          {state.reason && <> — <span className="uppercase">{state.reason}</span></>}
          {state.health && (
            <> · 7d: sent {state.health.sent}, bounce {(state.health.br * 100).toFixed(1)}%, spam {(state.health.sr * 100).toFixed(2)}%</>
          )}
        </div>
        {role === "owner" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => act("resume")}>
              Resume anyway
            </Button>
            <Button variant="ghost" size="sm" onClick={() => act("pause")}>
              Keep paused
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}



