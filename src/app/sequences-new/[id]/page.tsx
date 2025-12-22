"use client";
import useSWR from "swr";
import { useState } from "react";

const fetcher = (u: string) => fetch(u).then(r => r.json());

function StepRow({ step, onChange, onDelete }: { 
  step: any; 
  onChange: (s: any) => void; 
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg p-3 grid gap-2">
      <div className="flex gap-3">
        <input 
          className="border rounded px-2 py-1 w-20" 
          type="number" 
          value={step.position} 
          onChange={e => onChange({ ...step, position: Number(e.target.value) })} 
        />
        <select 
          className="border rounded px-2 py-1" 
          value={step.advanceRule} 
          onChange={e => onChange({ ...step, advanceRule: e.target.value })}
        >
          {["always", "if_no_open", "if_no_click", "if_open", "if_click"].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input 
          className="border rounded px-2 py-1 w-32" 
          type="number" 
          value={step.waitSeconds} 
          onChange={e => onChange({ ...step, waitSeconds: Number(e.target.value || 0) })} 
          placeholder="wait seconds" 
        />
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <input 
          className="border rounded px-2 py-1" 
          placeholder="Subject override (optional)" 
          value={step.subject || ""} 
          onChange={e => onChange({ ...step, subject: e.target.value })} 
        />
        <input 
          className="border rounded px-2 py-1" 
          placeholder="Template ID (optional)" 
          value={step.templateId || ""} 
          onChange={e => onChange({ ...step, templateId: e.target.value })} 
        />
      </div>
      <textarea 
        className="border rounded px-2 py-1 h-24" 
        placeholder="HTML override (optional)" 
        value={step.html || ""} 
        onChange={e => onChange({ ...step, html: e.target.value })} 
      />
      <div>
        <button className="text-sm underline" onClick={onDelete}>
          Delete step
        </button>
      </div>
    </div>
  );
}

export default function SequencePage({ params }: { params: { id: string } }) {
  const { data, mutate } = useSWR(`/api/sequences-new/${params.id}/steps`, fetcher, { refreshInterval: 5000 });
  const [steps, setSteps] = useState<any[]>([]);
  const [toEmail, setTo] = useState(""); 
  const [vars, setVars] = useState('{"first_name":"Alex"}'); 
  const [startIn, setStartIn] = useState(0);

  // sync
  if (data && steps.length === 0) {
    setTimeout(() => setSteps((data.steps || []).map((s: any) => ({
      position: s.position, 
      templateId: s.template_id, 
      subject: s.subject_override, 
      html: s.html_override, 
      waitSeconds: s.wait_seconds, 
      advanceRule: s.advance_rule
    }))), 0);
  }

  function addStep() {
    setSteps([...steps, { 
      position: (steps[steps.length - 1]?.position ?? 0) + 1, 
      templateId: "", 
      subject: "", 
      html: "", 
      waitSeconds: 86400, 
      advanceRule: "if_no_open" 
    }]);
  }
  
  async function save() {
    const res = await fetch(`/api/sequences-new/${params.id}/steps`, {
      method: "PUT", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ steps })
    });
    const j = await res.json(); 
    if (!res.ok || !j.ok) return alert(j.error || "Save failed"); 
    mutate();
  }
  
  async function enroll() {
    const res = await fetch(`/api/sequences-new/${params.id}/enroll`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        to: toEmail, 
        vars: JSON.parse(vars || "{}"), 
        startInSeconds: Number(startIn || 0) 
      })
    });
    const j = await res.json(); 
    if (!res.ok || !j.ok) return alert(j.error || "Enroll failed"); 
    alert("Enrolled!");
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Sequence Builder</h1>

      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Sequence: {data?.sequence?.name}
          </div>
          <div className="text-xs">
            Campaign: {data?.sequence?.campaign_id || "(none)"}
          </div>
        </div>

        <div className="grid gap-3">
          {steps.map((s, idx) => (
            <StepRow 
              key={idx} 
              step={s}
              onChange={(ns) => setSteps(steps.map((x, i) => i === idx ? ns : x))}
              onDelete={() => setSteps(steps.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button className="border rounded px-3 py-1" onClick={addStep}>
            Add Step
          </button>
          <button className="border rounded px-3 py-1" onClick={save}>
            Save Steps
          </button>
        </div>
      </div>

      <div className="border rounded-xl p-4 space-y-2 max-w-xl">
        <h2 className="text-lg font-medium">Enroll Test Contact</h2>
        <input 
          className="border rounded px-2 py-1 w-full" 
          placeholder="to@example.com" 
          value={toEmail} 
          onChange={e => setTo(e.target.value)} 
        />
        <textarea 
          className="border rounded px-2 py-1 w-full h-24" 
          value={vars} 
          onChange={e => setVars(e.target.value)} 
        />
        <div className="flex items-center gap-2">
          <span className="text-sm">Start in (seconds)</span>
          <input 
            className="border rounded px-2 py-1 w-24" 
            type="number" 
            value={startIn} 
            onChange={e => setStartIn(Number(e.target.value || 0))} 
          />
        </div>
        <button className="border rounded px-3 py-1" onClick={enroll}>
          Enroll
        </button>
      </div>
    </div>
  );
}