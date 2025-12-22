"use client";

import { useState } from "react";

export function ContactDealPanel({
  contactId,
  initialLeadStatus,
  initialEst,
  initialActual,
}: {
  contactId: string;
  initialLeadStatus: string;
  initialEst: number | null;
  initialActual: number | null;
}) {
  const [est, setEst] = useState(initialEst || 0);
  const [actual, setActual] = useState(initialActual || 0);
  const [leadStatus, setLeadStatus] = useState(initialLeadStatus);
  const [saving, setSaving] = useState(false);

  async function saveDeal(markWon: boolean) {
    setSaving(true);
    const res = await fetch(`/api/contacts/${contactId}/deal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estJobValue: est,
        actualJobValue: markWon ? actual : undefined,
        markWon,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert("Failed to save deal");
      return;
    }

    setLeadStatus(data.lead_status);
  }

  return (
    <div className="border rounded-2xl p-3 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">Job Value</div>
          <div className="text-[11px] text-gray-500">
            Attach dollars to this contact so SmartSend can track revenue.
          </div>
        </div>
        <div className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-gray-700 uppercase">
          {leadStatus || "new"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold mb-1 block">
            Estimated value
          </label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">$</span>
            <input
              type="number"
              value={est}
              onChange={(e) => setEst(Number(e.target.value))}
              className="w-full border rounded-xl px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold mb-1 block">
            Actual (when won)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">$</span>
            <input
              type="number"
              value={actual}
              onChange={(e) => setActual(Number(e.target.value))}
              className="w-full border rounded-xl px-2 py-1 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => saveDeal(false)}
          disabled={saving}
          className="px-3 py-1.5 rounded-xl border text-xs"
        >
          Save Value
        </button>
        <button
          onClick={() => saveDeal(true)}
          disabled={saving}
          className="px-3 py-1.5 rounded-xl bg-black text-white text-xs font-semibold"
        >
          Mark as Won
        </button>
      </div>
    </div>
  );
}



























































