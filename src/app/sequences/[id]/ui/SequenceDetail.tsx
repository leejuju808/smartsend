"use client";
import { useEffect, useState } from "react";
import PreviewBox from "./PreviewBox";

type Step = { id:string; step_no:number; subject:string; body:string; delay_days:number };
type Metrics = { step_no:number; sent:number; open:number; reply:number };

export default function SequenceDetail({ sequenceId, userId }: { sequenceId:string; userId:string }) {
  const [seq, setSeq] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [metrics, setMetrics] = useState<Metrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/sequences/${sequenceId}/detail?userId=${userId}`, { cache: "no-store" });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return;
    setSeq(j.sequence); setSteps(j.steps); setMetrics(j.metrics);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sequenceId, userId]);

  async function addStep() {
    const subject = prompt("Subject?");
    const body = prompt("Body? (must include %UNSUB%)", "Hi {{name}},\n\n%UNSUB%\n123 Demo St");
    const delay_days = Number(prompt("Delay days from previous (0 = immediate)?", "0") || "0");
    if (!subject || !body) return;
    const r = await fetch(`/api/sequences/${sequenceId}/steps?userId=${userId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, body, delay_days })
    });
    if (r.status === 402) {
      // lazy-load modal to keep diff tiny
      alert("You've reached the Free plan step limit (3). Upgrade to add more steps.");
      window.location.href = "/dashboard/billing/upgrade";
      return;
    }
    if (r.ok) load();
    else alert("Failed to add step");
  }

  async function saveStep(step: Step) {
    const r = await fetch(`/api/sequences/steps/${step.id}?userId=${userId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(step)
    });
    if (!r.ok) alert("Failed to save"); else load();
  }

  async function delStep(stepId: string) {
    if (!confirm("Delete this step?")) return;
    const r = await fetch(`/api/sequences/steps/${stepId}?userId=${userId}`, { method: "DELETE" });
    if (!r.ok) alert("Failed"); else load();
  }

  async function setStopOnReply(v:boolean) {
    await fetch(`/api/sequences/${sequenceId}/stop-on-reply?userId=${userId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: v })
    });
    load();
  }

  async function testSend(step_no:number) {
    if (!testTo) return alert("Enter a test email first");
    const r = await fetch(`/api/sequences/${sequenceId}/test-send?userId=${userId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ step_no, to: testTo })
    });
    const j = await r.json();
    if (r.ok) alert("Test sent (check inbox)"); else alert(j?.error || "Failed");
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!seq) return <div className="p-6 text-red-600">Not found</div>;

  const mBy = Object.fromEntries(metrics.map(m => [m.step_no, m]));

  return (
    <div className="p-6 grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{seq.name}</h1>
          <div className="text-sm text-gray-600">Status: <b>{seq.status}</b></div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!seq.stop_on_reply} onChange={e => setStopOnReply(e.target.checked)} />
            Stop on reply
          </label>
          <button onClick={addStep} className="rounded-xl bg-black text-white px-3 py-1.5">Add Step</button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left p-3">Step</th>
              <th className="text-left p-3">Subject</th>
              <th className="text-right p-3">Delay (d)</th>
              <th className="text-right p-3">Sent</th>
              <th className="text-right p-3">Opened</th>
              <th className="text-right p-3">Replied</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {steps.map(s => {
              const m = mBy[s.step_no] || { sent:0, open:0, reply:0 };
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-medium">{s.step_no}</td>
                  <td className="p-3">
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={s.subject}
                      onChange={e => s.subject = e.target.value}
                      onBlur={() => saveStep(s)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      className="w-16 border rounded px-2 py-1 text-right"
                      type="number"
                      value={s.delay_days}
                      onChange={e => s.delay_days = Number(e.target.value)}
                      onBlur={() => saveStep(s)}
                    />
                  </td>
                  <td className="p-3 text-right">{m.sent}</td>
                  <td className="p-3 text-right">{m.open}</td>
                  <td className="p-3 text-right">{m.reply}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => testSend(s.step_no)} className="rounded-xl bg-blue-600 text-white px-3 py-1.5 mr-2">Test</button>
                    <button onClick={() => delStep(s.id)} className="rounded-xl bg-red-600 text-white px-3 py-1.5">Delete</button>
                  </td>
                </tr>
              );
            })}
            {steps.length === 0 && (
              <tr><td className="p-4 text-sm text-gray-600" colSpan={7}>No steps yet. Click “Add Step”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="text-sm text-gray-600">Test send to:</div>
        <div className="mt-2 flex gap-2">
          <input className="border rounded-xl px-3 py-2 flex-1" placeholder="you@yourdomain.com" value={testTo} onChange={e=>setTestTo(e.target.value)} />
          <span className="text-xs text-gray-500 self-center">Uses your connected mailbox</span>
        </div>
      </div>

      {/* Personalization preview for first step by default */}
      <PreviewBox sequenceId={sequenceId} userId={userId} stepNo={1} />
    </div>
  );
}


    </div>
  );
}

