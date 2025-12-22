// Block 20070 — Job Value Bar

"use client";

import { useState } from "react";

interface JobValueBarProps {
  conversationId: string;
  initialEstimated?: number | null;
  initialActual?: number | null;
  initialInsuranceClaim?: boolean | null;
  initialInsuranceCarrier?: string | null;
  onUpdated?: (payload: any) => void;
}

export function JobValueBar({
  conversationId,
  initialEstimated,
  initialActual,
  initialInsuranceClaim,
  initialInsuranceCarrier,
  onUpdated,
}: JobValueBarProps) {
  const [estimated, setEstimated] = useState<string>(
    initialEstimated ? String(initialEstimated) : ""
  );
  const [actual, setActual] = useState<string>(
    initialActual ? String(initialActual) : ""
  );
  const [isClaim, setIsClaim] = useState<boolean>(!!initialInsuranceClaim);
  const [carrier, setCarrier] = useState<string>(initialInsuranceCarrier || "");
  const [saving, setSaving] = useState(false);

  async function saveJobValue(opts?: { markClosedWon?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/job/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          estimated_job_value: estimated ? Number(estimated) : undefined,
          actual_job_value: actual ? Number(actual) : undefined,
          is_insurance_claim: isClaim,
          insurance_carrier: isClaim ? carrier : null,
          mark_closed_won: opts?.markClosedWon || false,
        }),
      });

      const data = await res.json();
      setSaving(false);

      if (data?.conversation && onUpdated) {
        onUpdated(data.conversation);
      }
    } catch (error) {
      console.error("Error saving job value:", error);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Est. job value</span>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">$</span>
          <input
            type="number"
            min={0}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            className="w-24 border rounded-md px-2 py-1 text-xs"
            placeholder="e.g. 12000"
          />
        </div>

        <span className="ml-3 text-gray-500">Actual</span>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">$</span>
          <input
            type="number"
            min={0}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="w-24 border rounded-md px-2 py-1 text-xs"
            placeholder="final"
          />
        </div>

        <button
          onClick={() => saveJobValue()}
          disabled={saving}
          className="ml-2 px-3 py-1 rounded-full border border-gray-300 hover:border-black disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={isClaim}
            onChange={(e) => setIsClaim(e.target.checked)}
            className="rounded"
          />
          <span>Insurance claim</span>
        </label>

        {isClaim && (
          <input
            type="text"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="border rounded-md px-2 py-1 text-xs"
            placeholder="Carrier (e.g. State Farm)"
          />
        )}

        <button
          onClick={() => saveJobValue({ markClosedWon: true })}
          disabled={saving}
          className="px-3 py-1 rounded-full border border-emerald-400 text-emerald-700 hover:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✅ Save & mark won
        </button>

        {saving && (
          <span className="text-[10px] text-gray-400">Saving…</span>
        )}
      </div>
    </div>
  );
}

















































