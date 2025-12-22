"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PresendGuard from "@/components/PresendGuard";

async function jsonFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || "Request failed");
  return j;
}

export default function CampaignSendPage() {
  const params = useParams();
  const id = params.id as string;
  const [progress, setProgress] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [sendEnabled, setSendEnabled] = useState(true);
  const timer = useRef<any>(null);

  const load = async () => {
    try {
      const p = await jsonFetch(`/api/campaigns/${id}/progress`);
      setProgress(p);
      setError("");
    } catch (e: any) {
      setError("Error loading progress: " + e.message);
    }
  };

  const tick = async () => {
    try {
      await jsonFetch(`/api/campaigns/${id}/send-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 100 }),
      });
      await load();
    } catch (e: any) {
      console.error(e);
      setError("Error sending batch: " + e.message);
      setRunning(false);
      clearInterval(timer.current);
    }
  };

  const startAuto = async () => {
    setRunning(true);
    setError("");
    await tick();
    timer.current = setInterval(async () => {
      await tick();
      if (progress && (progress.pending ?? 0) <= 0) {
        clearInterval(timer.current);
        setRunning(false);
      }
    }, 1500); // pace API calls (and provider rate)
  };

  const pause = async () => {
    try {
      await jsonFetch(`/api/campaigns/${id}/pause`, { method: "POST" });
      setRunning(false);
      clearInterval(timer.current);
      await load();
    } catch (e: any) {
      setError("Error pausing: " + e.message);
    }
  };

  const resume = async () => {
    try {
      await jsonFetch(`/api/campaigns/${id}/resume`, { method: "POST" });
      await startAuto();
    } catch (e: any) {
      setError("Error resuming: " + e.message);
    }
  };

  const cancel = async () => {
    try {
      await jsonFetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
      setRunning(false);
      clearInterval(timer.current);
      await load();
    } catch (e: any) {
      setError("Error cancelling: " + e.message);
    }
  };

  useEffect(() => { 
    load(); 
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

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
          <h1 className="text-2xl font-semibold">Campaign Send Console</h1>
          <p className="text-sm text-gray-600">Campaign ID: {id}</p>
          <p className="text-sm text-gray-600">Status: {progress?.status ?? "…"}</p>
        </div>
        <div className="flex gap-2">
          {!running && (
            <button 
              onClick={startAuto} 
              className={`px-4 py-2 rounded-2xl text-white transition-colors ${
                sendEnabled 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
              disabled={!sendEnabled}
            >
              {sendEnabled ? 'Start' : 'Start (Blocked)'}
            </button>
          )}
          {running && <button onClick={pause} className="px-4 py-2 rounded-2xl border hover:bg-gray-50">Pause</button>}
          <button onClick={cancel} className="px-4 py-2 rounded-2xl border hover:bg-gray-50">Cancel</button>
        </div>
      </header>

      <PresendGuard 
        campaignId={id} 
        onSendEnabled={setSendEnabled}
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <div>
        <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
          <div className="h-3 bg-green-600 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm mt-2 text-gray-600">
          {sent}/{total} sent · {pending} pending · {suppressed} suppressed · {failed} failed
        </p>
      </div>

      <section className="space-y-2">
        <button
          onClick={async () => { await tick(); }}
          className="px-4 py-2 rounded-2xl border hover:bg-gray-50"
        >
          Process next 100 now
        </button>
        <button
          onClick={load}
          className="px-4 py-2 rounded-2xl border hover:bg-gray-50"
        >
          Refresh stats
        </button>
      </section>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h3 className="font-medium text-blue-800">Sending Tips</h3>
        <ul className="text-sm text-blue-600 mt-2 list-disc list-inside space-y-1">
          <li>Use a small batch size + delay (1–2s) to respect provider limits</li>
          <li>Keep your domain reputation clean by pacing sends</li>
          <li>Monitor progress and pause if needed</li>
          <li>Check the console for any errors</li>
        </ul>
      </div>

      <div className="pt-6 border-t">
        <Link
          href={`/dashboard/campaigns-new/${id}`}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Campaign
        </Link>
      </div>
    </main>
  );
} 