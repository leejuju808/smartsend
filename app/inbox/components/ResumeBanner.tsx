"use client";

import React, { useState } from "react";
import { inboxResumeCampaign, inboxResumeLead, inboxPauseLead } from "../actions";

export default function ResumeBanner({
  campaignId,
  leadId,
  paused,
}: {
  campaignId: string;
  leadId: string;
  paused: {
    campaign: { isPaused: boolean; reason: string | null; spikeAuto: boolean };
    lead: { isPaused: boolean; reason: string | null };
  };
}) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(paused);

  async function onResumeCampaign() {
    setBusy(true);
    try {
      await inboxResumeCampaign(campaignId);
      setLocal((p) => ({
        ...p,
        campaign: { ...p.campaign, isPaused: false, reason: null },
      }));
    } catch (error) {
      console.error("Failed to resume campaign:", error);
    } finally {
      setBusy(false);
    }
  }

  async function onResumeLead() {
    setBusy(true);
    try {
      await inboxResumeLead(campaignId, leadId);
      setLocal((p) => ({
        ...p,
        lead: { ...p.lead, isPaused: false, reason: null },
      }));
    } catch (error) {
      console.error("Failed to resume lead:", error);
    } finally {
      setBusy(false);
    }
  }

  async function onPauseLead() {
    setBusy(true);
    try {
      await inboxPauseLead(campaignId, leadId);
      setLocal((p) => ({
        ...p,
        lead: { ...p.lead, isPaused: true, reason: "manual" },
      }));
    } catch (error) {
      console.error("Failed to pause lead:", error);
    } finally {
      setBusy(false);
    }
  }

  const items: Array<React.JSX.Element> = [];

  if (local.campaign.isPaused) {
    items.push(
      <div key="camp" className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Campaign is paused</div>
          <div className="text-xs opacity-70">
            {local.campaign.reason === "spike_autopause"
              ? "Auto-paused due to error spike."
              : local.campaign.reason ?? "Manually paused."}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onResumeCampaign}
            disabled={busy}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Resume campaign
          </button>
          <a
            href={`/campaigns/${campaignId}/queue`}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Open Queue
          </a>
        </div>
      </div>
    );
  }

  if (local.lead.isPaused) {
    items.push(
      <div key="lead" className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Lead is paused</div>
          <div className="text-xs opacity-70">
            {local.lead.reason ?? "Manually paused."}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onResumeLead}
            disabled={busy}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Resume lead
          </button>
          <button
            onClick={onPauseLead}
            disabled={busy}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Pause again
          </button>
          <a
            href={`/campaigns/${campaignId}/lead/${leadId}`}
            className="rounded-xl border px-3 py-1.5 text-sm"
          >
            Lead Inspector
          </a>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 border-b bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
      {items}
    </div>
  );
}
