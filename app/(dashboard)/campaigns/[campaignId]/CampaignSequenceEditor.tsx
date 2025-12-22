// app/(dashboard)/campaigns/[campaignId]/CampaignSequenceEditor.tsx
"use client";

import { useState } from "react";

export type SequenceStep = {
  subject: string;
  body: string;
  delay: number;
};

interface CampaignSequenceEditorProps {
  campaignId: string;
  initialSequence: SequenceStep[];
}

export function CampaignSequenceEditor({
  campaignId,
  initialSequence,
}: CampaignSequenceEditorProps) {
  const [sequence, setSequence] = useState<SequenceStep[]>(
    initialSequence.length
      ? initialSequence
      : [{ subject: "", body: "", delay: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateStep(index: number, key: keyof SequenceStep, value: any) {
    const copy = [...sequence];
    copy[index] = { ...copy[index], [key]: value };
    setSequence(copy);
  }

  function addStep() {
    setSequence([
      ...sequence,
      { subject: "", body: "", delay: 3 },
    ]);
  }

  function removeStep(index: number) {
    if (sequence.length === 1) return; // keep at least one
    const copy = [...sequence];
    copy.splice(index, 1);
    setSequence(copy);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save sequence");
      }

      setMessage("Sequence saved");
      setTimeout(() => setMessage(null), 1500);
    } catch (err: any) {
      console.error("Save sequence error:", err);
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">
          Email Sequence
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={addStep}
            className="rounded-xl border border-neutral-700 px-3 py-1 text-neutral-100"
          >
            Add Step
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-neutral-100 px-3 py-1 font-semibold text-neutral-900 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Sequence"}
          </button>
        </div>
      </div>

      {message && (
        <div className="text-xs text-emerald-300">{message}</div>
      )}
      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      <div className="space-y-4">
        {sequence.map((step, i) => (
          <div
            key={i}
            className="space-y-2 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4"
          >
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Step {i + 1}</span>
              {sequence.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-red-300"
                >
                  Remove
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="Subject"
              value={step.subject}
              onChange={(e) =>
                updateStep(i, "subject", e.target.value)
              }
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
            />

            <textarea
              placeholder="Body"
              value={step.body}
              onChange={(e) =>
                updateStep(i, "body", e.target.value)
              }
              rows={4}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
            />

            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>Delay before this step (days)</span>
              <input
                type="number"
                min={0}
                value={step.delay}
                onChange={(e) =>
                  updateStep(i, "delay", Number(e.target.value))
                }
                className="w-16 rounded-xl border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-center text-neutral-100"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

























































