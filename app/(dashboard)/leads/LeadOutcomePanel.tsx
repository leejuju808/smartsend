// app/(dashboard)/leads/LeadOutcomePanel.tsx
// Block 8710 — Lead Outcome & Job Logging
"use client";

import { useState } from "react";

type Outcome = "open" | "won" | "lost";

export function LeadOutcomePanel(props: {
  leadId: string;
  initialOutcome: Outcome | null;
  initialWonValue?: number | null;
  initialNotes?: string | null;
  onSave?: () => void;
}) {
  const { leadId, initialOutcome, initialWonValue, initialNotes } = props;

  const [outcome, setOutcome] = useState<Outcome>(
    initialOutcome || "open"
  );
  const [wonValue, setWonValue] = useState(
    initialWonValue != null ? String(initialWonValue) : ""
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus(null);

    try {
      const body: any = { outcome };
      if (outcome === "won" && wonValue) {
        body.won_value = Number(wonValue);
      }
      if (notes !== undefined) {
        body.notes = notes;
      }

      const res = await fetch(`/api/leads/${leadId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      setStatus("Saved.");
      setTimeout(() => setStatus(null), 2000);
      
      // Refresh parent data if callback provided
      if (props.onSave) {
        props.onSave();
      }
    } catch (err: any) {
      console.error("Save outcome error:", err);
      setStatus(err.message ?? "Error saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-xs text-neutral-100">
      <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
        Job Outcome
      </div>

      <div className="flex gap-2">
        {(["open", "won", "lost"] as Outcome[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className={`rounded-xl px-3 py-1.5 text-[0.7rem] font-semibold ${
              outcome === o
                ? o === "won"
                  ? "bg-emerald-500 text-neutral-900"
                  : o === "lost"
                  ? "bg-red-500 text-neutral-50"
                  : "bg-neutral-100 text-neutral-900"
                : "bg-neutral-900 text-neutral-300 border border-neutral-700"
            }`}
          >
            {o === "open" ? "Open" : o === "won" ? "Won" : "Lost"}
          </button>
        ))}
      </div>

      {outcome === "won" && (
        <div className="flex flex-col gap-1">
          <label className="text-[0.7rem] text-neutral-300">
            Job value (roof contract total)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-neutral-400">$</span>
            <input
              type="number"
              min={0}
              step={500}
              value={wonValue}
              onChange={(e) => setWonValue(e.target.value)}
              placeholder="e.g. 15000"
              className="w-32 rounded-xl border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-[0.7rem] text-neutral-300">
          Internal notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-xs text-neutral-100"
          placeholder="e.g. Insurance claim, full replacement, added gutters, referred by neighbor."
        />
      </div>

      {status && (
        <div className="text-[0.7rem] text-neutral-400">
          {status}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-neutral-100 px-3 py-1.5 text-[0.7rem] font-semibold text-neutral-900 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Outcome"}
      </button>
    </div>
  );
}

