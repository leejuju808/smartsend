// app/(dashboard)/leads/LeadOutcomeControls.tsx
"use client";

import { useState } from "react";

type Outcome = "won" | "lost" | null;

interface LeadOutcomeControlsProps {
  leadId: string;
  initialOutcome: Outcome;
  initialWonValue: number | null;
  initialLostReason: string | null;
}

export function LeadOutcomeControls({
  leadId,
  initialOutcome,
  initialWonValue,
  initialLostReason,
}: LeadOutcomeControlsProps) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [wonValue, setWonValue] = useState<string>(
    initialWonValue ? String(initialWonValue) : ""
  );
  const [lostReason, setLostReason] = useState(initialLostReason || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateOutcome(next: Outcome) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const body: any = { outcome: next };
      if (next === "won") {
        body.won_value = wonValue ? Number(wonValue) : null;
      }
      if (next === "lost") {
        body.lost_reason = lostReason || null;
      }

      const res = await fetch(`/api/leads/${leadId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update lead");
      }

      setOutcome(next);
      if (next === "won") {
        setMessage("Marked as won");
      } else if (next === "lost") {
        setMessage("Marked as lost");
      } else {
        setMessage("Outcome cleared");
      }
      setTimeout(() => setMessage(null), 1500);
    } catch (err: any) {
      console.error("Lead outcome update error:", err);
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-neutral-300">Outcome</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => updateOutcome("won")}
            className={`rounded-full px-3 py-1 transition-colors ${
              outcome === "won"
                ? "bg-emerald-500 text-neutral-900"
                : "border border-neutral-700 text-neutral-100 hover:bg-neutral-800"
            }`}
          >
            Won
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => updateOutcome("lost")}
            className={`rounded-full px-3 py-1 transition-colors ${
              outcome === "lost"
                ? "bg-red-500 text-neutral-50"
                : "border border-neutral-700 text-neutral-100 hover:bg-neutral-800"
            }`}
          >
            Lost
          </button>
          {outcome && (
            <button
              type="button"
              disabled={saving}
              onClick={() => updateOutcome(null)}
              className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {outcome === "won" && (
        <div className="flex items-center gap-2">
          <span className="w-24 text-neutral-400">Won Value</span>
          <input
            type="number"
            min={0}
            step="100"
            value={wonValue}
            onChange={(e) => setWonValue(e.target.value)}
            className="w-32 rounded-xl border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-right text-neutral-100"
            placeholder="0"
          />
          <span className="text-neutral-400">$</span>
        </div>
      )}

      {outcome === "lost" && (
        <div className="flex flex-col gap-1">
          <span className="text-neutral-400">Lost Reason (optional)</span>
          <input
            type="text"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-neutral-100"
            placeholder="e.g. chose competitor, no budget, not urgent"
          />
        </div>
      )}

      {message && (
        <div className="text-[0.7rem] text-emerald-300">{message}</div>
      )}
      {error && (
        <div className="text-[0.7rem] text-red-400">{error}</div>
      )}
    </div>
  );
}

























































