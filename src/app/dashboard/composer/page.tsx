'use client';
import { useState } from 'react';
import { detectVars } from '@/lib/composer/presets';

export default function ComposerPage() {
  const [prompt, setPrompt] = useState('Short intro to SmartSend for RevOps leaders; ask for a 7‑minute call; mention CSV import + sequences.');
  const [tone, setTone] = useState('direct');
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/composer/generate', { 
        method: 'POST', 
        headers: { 'Content-Type':'application/json' }, 
        body: JSON.stringify({ prompt, tone }) 
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'compose failed');
      setDraft(j.draft);
    } catch (e: any) { 
      setMsg(e.message); 
    } finally { 
      setBusy(false); 
    }
  }

  async function createSequence() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    try {
      // Get the current workspace ID from localStorage or context
      const activeWorkspace = localStorage.getItem('active_workspace');
      if (!activeWorkspace) {
        setMsg('No active workspace selected');
        setBusy(false);
        return;
      }

      const res = await fetch('/api/sequences/save', { 
        method: 'POST', 
        headers: { 'Content-Type':'application/json' }, 
        body: JSON.stringify({ 
          sequence: {
            ...draft,
            workspace_id: activeWorkspace
          },
          steps: draft.steps
        }) 
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'save failed');
      setMsg('Sequence created: ' + j.id);
    } catch (e: any) { 
      setMsg(e.message); 
    } finally { 
      setBusy(false); 
    }
  }

  const vars = draft ? detectVars(JSON.stringify(draft)) : [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Magic Composer</h1>

      <div className="rounded-2xl border p-4 space-y-3">
        <label className="font-medium">Your prompt</label>
        <textarea 
          value={prompt} 
          onChange={e=>setPrompt(e.target.value)} 
          rows={4} 
          className="w-full border rounded-xl p-3" 
          placeholder="What should this sequence do? Who is it for? Key value props?" 
        />
        <div className="flex items-center gap-3 text-sm">
          <label>Tone</label>
          <select value={tone} onChange={e=>setTone(e.target.value)} className="border rounded-xl p-2">
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
            <option value="casual">Casual</option>
            <option value="professional">Professional</option>
          </select>
          <button 
            onClick={generate} 
            disabled={busy} 
            className="px-4 py-2 rounded-xl border bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Thinking…' : 'Generate'}
          </button>
        </div>
        {msg && <div className="text-sm text-red-600">{msg}</div>}
      </div>

      {draft && (
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Preview: {draft.name}</div>
          <div className="text-xs text-gray-600">
            Sends between {draft.send_window.start_hour}:00–{draft.send_window.end_hour}:00 on days {draft.send_window.days.join(', ')} · stop_on_reply: {String(draft.stop_on_reply)}
          </div>
          
          {vars.length > 0 && (
            <div className="text-xs text-blue-600">
              Variables detected: {vars.join(', ')}
            </div>
          )}
          
          <div className="space-y-3">
            {draft.steps.map((s:any) => (
              <div key={s.step_no} className="rounded-xl border p-3">
                <div className="text-sm font-medium">Step {s.step_no} • wait {Math.round((s.wait_seconds||0)/3600)}h</div>
                <div className="text-sm">Subject: {s.subject_template}</div>
                <div className="text-sm whitespace-pre-wrap">{s.text_template}</div>
              </div>
            ))}
          </div>
          <button 
            onClick={createSequence} 
            disabled={busy} 
            className="px-4 py-2 rounded-xl border bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          >
            Create sequence
          </button>
        </div>
      )}
    </div>
  );
} 