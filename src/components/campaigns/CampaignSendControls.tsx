"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CampaignSendControlsProps {
  campaignId: string;
}

interface QueueStats {
  queued: number;
  sent_last_24h: number;
  errors: number;
  is_paused: boolean;
}

export default function CampaignSendControls({ campaignId }: CampaignSendControlsProps) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState<
    "deliverability_issue" | "no_leads" | "seasonal_break" | "vacation" | "other"
  >("deliverability_issue");

  useEffect(() => {
    loadStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  async function loadStats() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/queue-stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to load queue stats:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaign() {
    if (!stats) return;

    // BLOCK 269600 — SmartSend Enforcement Sprint:
    // Pausing requires a reason (dropdown) and should be one click.
    if (!stats.is_paused) {
      setPauseConfirmOpen(true);
      return;
    }

    setToggling(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused: !stats.is_paused }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to toggle campaign");
      }

      await loadStats(); // Refresh stats
    } catch (error: any) {
      alert(error.message || "Failed to toggle campaign");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Loading stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Failed to load stats</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Outreach Controls</h3>
          <Button
            onClick={toggleCampaign}
            disabled={toggling}
            variant={stats.is_paused ? "default" : "outline"}
          >
            {toggling
              ? "Updating..."
              : stats.is_paused
              ? "Resume City Outreach"
              : "Pause City Outreach"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{stats.queued}</div>
            <div className="text-sm text-muted-foreground">Queued to contact</div>
          </div>

          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{stats.sent_last_24h}</div>
            <div className="text-sm text-muted-foreground">Contacted (last 24h)</div>
          </div>

          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
            <div className="text-sm text-muted-foreground">Errors</div>
          </div>
        </div>

        {stats.is_paused && (
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            City outreach is paused. Homeowners will not be contacted until resumed.
          </div>
        )}
      </div>

      <Dialog
        open={pauseConfirmOpen}
        onOpenChange={(open) => {
          setPauseConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause city outreach?</DialogTitle>
            <DialogDescription>
              Select a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value as any)}
            >
              <option value="deliverability_issue">Reach health issue</option>
              <option value="no_leads">No homeowners loaded</option>
              <option value="seasonal_break">Seasonal break</option>
              <option value="vacation">Vacation</option>
              <option value="other">Other</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseConfirmOpen(false)}>
              Keep running
            </Button>
            <Button
              onClick={async () => {
                setPauseConfirmOpen(false);
                setToggling(true);
                try {
                  const res = await fetch(`/api/campaigns/${campaignId}/pause`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isPaused: true, reason: pauseReason }),
                  });
                  if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || "Failed to pause campaign");
                  }
                  await loadStats();
                } catch (error: any) {
                  alert(error.message || "Failed to pause campaign");
                } finally {
                  setToggling(false);
                }
              }}
            >
              Pause city outreach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

