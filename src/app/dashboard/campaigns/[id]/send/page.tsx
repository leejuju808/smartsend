"use client";

import { useEffect, useRef, useState } from "react";
import SuppressionGuardBanner from "@/components/SuppressionGuardBanner";

async function jsonFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "Request failed");
  return j;
}

export default function CampaignSendPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [progress, setProgress] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const timer = useRef<any>(null);

  const load = async () => {
    const p = await jsonFetch(`/api/campaigns/${id}/progress`);
    setProgress(p);
    
    // Check if we can send (no blocked recipients)
    try {
      const presendCheck = await jsonFetch(`/api/campaigns/${id}/presend-check`);
      setCanSend(presendCheck.final_sendable > 0);
    } catch (e) {
      console.error('Failed to check pre-send safety:', e);
      setCanSend(false);
    }
  };

  const tick = async () => {
    try {
      const response = await jsonFetch(`/api/campaigns/${id}/send-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 100 }),
      });
      
      // Check for plan limit reached
      if (response.halted && response.reason === "send limit reached") {
        alert(`You've hit your ${response.plan} plan send limit (${response.limit}). Upgrade in Billing to continue.`);
        setRunning(false);
        clearInterval(timer.current);
        return;
      }
      
      await load();
    } catch (e: any) {
      console.error(e);
      
      // Check if it's a plan limit error
      if (e.message?.includes("send limit reached") || e.status === 402) {
        alert("You've hit your plan send limit. Upgrade in Billing to continue.");
        setRunning(false);
        clearInterval(timer.current);
        return;
      }
      
      setRunning(false);
      clearInterval(timer.current);
    }
  };

  const startAuto = async () => {
    if (!canSend) {
      alert('Please fix the recipient list issues before sending.');
      return;
    }
    
    setRunning(true);
    await tick();
    timer.current = setInterval(async () => {
      await tick();
      if (progress && (progress.pending ?? 0) <= 0) {
        clearInterval(timer.current);
        setRunning(false);
      }
    }, 1500); // pace API calls (and provider rate)
  };

  const handleFixComplete = () => {
    // Refresh the progress and send status after fixing
    load();
  };

  const pause = async () => {
    await jsonFetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    setRunning(false);
    clearInterval(timer.current);
    await load();
  };

  const resume = async () => {
    await jsonFetch(`/api/campaigns/${id}/resume`, { method: "POST" });
    await startAuto();
  };

  const cancel = async () => {
    await jsonFetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
    setRunning(false);
    clearInterval(timer.current);
    await load();
  };

  useEffect(() => { load(); }, []);

  const total = progress?.total ?? 0;
  const sent = progress?.sent ?? 0;
  const pending = progress?.pending ?? 0;
  const suppressed = progress?.suppressed ?? 0;
  const failed = progress?.failed ?? 0;
  const pct = total ? Math.round((sent / total) * 100) : 0;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaign Send</h1>
          <p className="text-sm text-neutral-600">Status: {progress?.status ?? "…"}</p>
        </div>
        <div className="flex gap-2">
          {!running && (
            <button 
              onClick={startAuto} 
              disabled={!canSend}
              className={`px-4 py-2 rounded-2xl ${
                canSend 
                  ? 'bg-black text-white hover:bg-gray-800' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Start
            </button>
          )}
          {running && <button onClick={pause} className="px-4 py-2 rounded-2xl border">Pause</button>}
          <button onClick={cancel} className="px-4 py-2 rounded-2xl border">Cancel</button>
        </div>
      </header>

      <SuppressionGuardBanner campaignId={id} onFixComplete={handleFixComplete} />

      <div>
        <div className="h-3 w-full bg-neutral-200 rounded-full overflow-hidden">
          <div className="h-3 bg-black" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm mt-2">
          {sent}/{total} sent · {pending} pending · {suppressed} suppressed · {failed} failed
        </p>
      </div>

      <section className="space-y-2">
        <button
          onClick={async () => { await tick(); }}
          className="px-4 py-2 rounded-2xl border"
        >
          Process next 100 now
        </button>
        <button
          onClick={load}
          className="px-4 py-2 rounded-2xl border"
        >
          Refresh stats
        </button>
      </section>

      <p className="text-xs text-neutral-500">
        Tip: use a small batch size + delay (1–2s) to respect provider limits and keep your domain reputation clean.
      </p>
    </main>
  );
} 