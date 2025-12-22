"use client";
import { useState } from "react";

type Generated = {
  subject: string;
  messages: { label: string; dayOffset: number; body: string }[];
};

export default function CampaignSave({
  generated,
  defaultName = "Outreach Campaign",
}: {
  generated: Generated | null;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!generated) return null;

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const payload = {
        name,
        subject: generated.subject,
        messages: generated.messages.map((m, i) => ({
          position: i,
          label: m.label,
          dayOffset: m.dayOffset,
          body: m.body,
        })),
      };
      const res = await fetch("/api/campaigns-new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMsg("Saved! Opened as draft in your campaigns.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="text-lg font-semibold mb-2">Save as Campaign</div>
      <div className="text-sm text-neutral-400 mb-3">
        Name your campaign and store the generated emails.
      </div>
      <input
        className="w-full mb-3 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
        value={name}
        onChange={(e)=>setName(e.target.value)}
        placeholder="Outreach v1"
      />
      <button
        onClick={save}
        disabled={saving || !name.trim()}
        className="rounded-2xl bg-yellow-400/90 text-black font-semibold px-4 py-2 hover:bg-yellow-300 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Campaign"}
      </button>
      {msg && <div className="mt-3 text-green-400 text-sm">{msg}</div>}
      {err && <div className="mt-3 text-red-400 text-sm">Error: {err}</div>}
    </div>
  );
}