"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { launchCampaign } from "./actions";
import { useRole } from "@/hooks/useRole";
import { can } from "@/lib/auth/permissions";
import { toast } from "sonner";

export default function LaunchPage() {
  const { id } = useParams();
  const campaignId = String(id);
  const role = useRole(campaignId);
  const [msg, setMsg] = useState("");

  async function onLaunch() {
    if (!can(role, "canSend")) {
      toast.error("You don't have permission to launch this campaign.");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("campaignId", campaignId);
      const res = await launchCampaign(null, fd);
      setMsg(`Queued: ${res.queued}. First send at: ${res.firstSendAt ?? "soon"}`);
      toast.success("Campaign launched successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to launch campaign");
    }
  }

  const canSend = can(role, "canSend");

  return (
    <main className="mx-auto max-w-xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Launch Campaign</h1>
      <button 
        onClick={onLaunch} 
        disabled={!canSend}
        className="rounded-xl border px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Launch
      </button>
      {!canSend && (
        <p className="text-sm text-red-600">You need sender or admin permissions to launch campaigns.</p>
      )}
      {msg && <p className="text-sm opacity-80">{msg}</p>}
    </main>
  );
}

