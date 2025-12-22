"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SharePanel } from "@/components/team/SharePanel";
import { SequenceStepRewriter } from "@/components/sequences/SequenceStepRewriter";
import { Sparkles } from "lucide-react";

type Step = { id: string; step_order: number; delay_hours: number; subject: string; body: string };
type Seq = { id: string; name: string; workspace_id?: string };

export default function SequenceEditor({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [seq, setSeq] = useState<Seq | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewriterOpenForStep, setRewriterOpenForStep] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/sequences/${params.id}`, { cache: "no-store" });
    const data = await res.json();
    setSeq(data.sequence);
    setSteps(data.steps || []);
    setLoading(false);
  };
  
  // Also fetch workspace_id for sharing
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/sequences/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.sequence?.workspace_id) {
          setWorkspaceId(data.sequence.workspace_id);
        }
      })
      .catch(() => {});
  }, [params.id]);

  useEffect(() => { load(); }, [params.id]);

  const saveName = async () => {
    if (!seq) return;
    await fetch(`/api/sequences/${seq.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: seq.name }),
    });
  };

  const addStep = async () => {
    const subject = prompt("Subject?");
    if (!subject) return;
    const body = prompt("Body? (plain text)") || "";
    const delay = Number(prompt("Delay hours from prior step? (e.g., 24)") || "0");
    const res = await fetch(`/api/sequences/${params.id}/steps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, delay_hours: delay }),
    });
    if (res.ok) load();
  };

  const deleteStep = async (id: string) => {
    if (!confirm("Delete step?")) return;
    const res = await fetch(`/api/sequences/${params.id}/steps/${id}`, { method: "DELETE" });
    if (res.ok) setSteps((x) => x.filter(s => s.id !== id));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const arr = [...steps];
    const tmp = arr[index];
    arr[index] = arr[target];
    arr[target] = tmp;
    // renumber
    setSteps(arr.map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const saveOrder = async () => {
    await fetch(`/api/sequences/${params.id}/steps`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(steps.map(s => ({ id: s.id, step_order: s.step_order, delay_hours: s.delay_hours, subject: s.subject, body: s.body }))),
    });
    alert("Saved order/changes");
  };

  const updateStepField = (i: number, key: keyof Step, val: any) => {
    const next = [...steps];
    (next[i] as any)[key] = val;
    setSteps(next);
  };

  const deleteSequence = async () => {
    if (!seq) return;
    if (!confirm("Delete this sequence?")) return;
    await fetch(`/api/sequences/${seq.id}`, { method: "DELETE" });
    router.push("/sequences");
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            className="text-2xl font-bold bg-transparent border-b border-gray-800 focus:outline-none focus:border-yellow-500"
            value={seq?.name || ""}
            onChange={(e) => setSeq((s) => s ? ({ ...s, name: e.target.value }) : s)}
            onBlur={saveName}
          />
          <span className="text-gray-500 text-sm">(auto-saved)</span>
        </div>
        <div className="flex gap-2">
          <button onClick={addStep} className="px-4 py-2 rounded-lg bg-yellow-500 text-black font-semibold">Add Step</button>
          <button onClick={saveOrder} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">Save Changes</button>
          <button onClick={deleteSequence} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500">Delete Sequence</button>
        </div>
      </div>

      {/* Share Panel */}
      {workspaceId && (
        <SharePanel type="sequence" id={params.id} workspaceId={workspaceId} />
      )}

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.id} className="border border-gray-800 rounded-xl p-4 bg-gray-950">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">Step {s.step_order}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setRewriterOpenForStep(rewriterOpenForStep === s.id ? null : s.id)}
                  className="px-2 py-1 rounded bg-gray-800 text-[11px] flex items-center gap-1 hover:bg-gray-700"
                >
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  Rewrite with AI
                </button>
                <button onClick={() => move(i, -1)} className="px-2 py-1 rounded bg-gray-800">↑</button>
                <button onClick={() => move(i, 1)} className="px-2 py-1 rounded bg-gray-800">↓</button>
                <button onClick={() => deleteStep(s.id)} className="px-2 py-1 rounded bg-red-600">Delete</button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">Subject</label>
                <input
                  className="w-full px-3 py-2 rounded bg-black border border-gray-800"
                  value={s.subject}
                  onChange={(e) => updateStepField(i, "subject", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Delay (hours)</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 rounded bg-black border border-gray-800"
                  value={s.delay_hours}
                  onChange={(e) => updateStepField(i, "delay_hours", Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs text-gray-400">Body</label>
              <textarea
                rows={5}
                className="w-full px-3 py-2 rounded bg-black border border-gray-800"
                value={s.body}
                onChange={(e) => updateStepField(i, "body", e.target.value)}
              />
            </div>

            {rewriterOpenForStep === s.id && (
              <div className="mt-4">
                <SequenceStepRewriter
                  stepId={s.id}
                  onApply={(newBody) => {
                    updateStepField(i, "body", newBody);
                    setRewriterOpenForStep(null);
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {steps.length === 0 && (
          <div className="border border-gray-800 rounded-xl p-8 text-gray-400">No steps yet — click "Add Step".</div>
        )}
      </div>
    </div>
  );
}