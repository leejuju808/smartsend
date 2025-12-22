"use client";

import { useState } from "react";
import { pauseCampaign, resumeCampaign, cancelQueued, boostPriority } from "./actions";
import { toast } from "sonner";

export function ControlsBar({ campaignId }: { campaignId: string }) {
  const [msg, setMsg] = useState("");

  async function run(fn: (id: string) => Promise<any>) {
    setMsg("Working…");
    try {
      await fn(campaignId);
      setMsg("Done.");
      toast.success("Success");
    } catch (e: any) {
      setMsg(e.message || "Error");
      toast.error(e.message || "Error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => run(pauseCampaign)}
        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      >
        Pause
      </button>
      <button
        onClick={() => run(resumeCampaign)}
        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      >
        Resume
      </button>
      <button
        onClick={() => run(cancelQueued)}
        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      >
        Cancel Queued
      </button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}

