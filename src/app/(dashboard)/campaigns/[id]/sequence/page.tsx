"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Step = {
  id?: string;
  step_no: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  active: boolean;
};

export default function SequencePage() {
  const params = useParams();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/campaigns/${params.id}/steps`);
        const j = await r.json();
        setSteps(
          j.rows?.length
            ? j.rows
            : [
                {
                  step_no: 1,
                  delay_days: 0,
                  subject_template: "",
                  body_template: "",
                  active: true,
                },
              ]
        );
      } catch (err) {
        console.error("Failed to load steps:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/campaigns/${params.id}/steps/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });
      const j = await r.json();
      if (j.ok) {
        alert("Saved ✅");
      } else {
        alert(`Error: ${j.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const add = () =>
    setSteps((s) => [
      ...s,
      {
        step_no: (s[s.length - 1]?.step_no || 0) + 1,
        delay_days: 2,
        subject_template: "Re: {{subject|quick question}}",
        body_template: "{{name|there}}, following up…",
        active: true,
      },
    ]);

  const remove = (idx: number) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Follow-up Sequence</h1>
        <div className="flex gap-2">
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={add}
          >
            + Add Step
          </button>
          <button
            className="rounded-xl border px-3 py-1.5 text-sm bg-black text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {steps.length === 0 && (
        <div className="text-sm text-gray-500">
          No steps defined. Click "+ Add Step" to create the first step.
        </div>
      )}

      {steps.map((s, i) => (
        <div key={i} className="rounded-2xl border p-4 space-y-2">
          <div className="flex gap-3 items-center">
            <div className="text-sm font-medium">Step #{s.step_no}</div>
            <label className="text-sm flex items-center gap-2">
              Delay (days)
              <input
                className="h-8 w-16 rounded border px-2 text-sm"
                type="number"
                min="0"
                value={s.delay_days}
                onChange={(e) => {
                  const v = parseInt(e.target.value || "0");
                  setSteps((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, delay_days: v } : x
                    )
                  );
                }}
              />
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                className="mr-2"
                checked={!!s.active}
                onChange={(e) =>
                  setSteps((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, active: e.target.checked } : x
                    )
                  )
                }
              />
              Active
            </label>
            {steps.length > 1 && (
              <button
                className="ml-auto text-sm text-red-600 hover:text-red-800"
                onClick={() => remove(i)}
              >
                Remove
              </button>
            )}
          </div>
          <input
            className="w-full h-9 rounded-md border px-3 text-sm"
            placeholder="Subject template"
            value={s.subject_template}
            onChange={(e) =>
              setSteps((prev) =>
                prev.map((x, idx) =>
                  idx === i ? { ...x, subject_template: e.target.value } : x
                )
              )
            }
          />
          <textarea
            className="w-full min-h-[120px] rounded-md border p-3 text-sm"
            placeholder="Body template"
            value={s.body_template}
            onChange={(e) =>
              setSteps((prev) =>
                prev.map((x, idx) =>
                  idx === i ? { ...x, body_template: e.target.value } : x
                )
              )
            }
          />
          <div className="text-xs text-gray-500">
            Use variables: <code className="bg-gray-100 px-1 rounded">{`{{name}}`}</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">{`{{company}}`}</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">{`{{email}}`}</code>
            {" "}or with defaults: <code className="bg-gray-100 px-1 rounded">{`{{name|there}}`}</code>
          </div>
        </div>
      ))}
    </div>
  );
}









