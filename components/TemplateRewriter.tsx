'use client';
import { useState, useMemo } from 'react';
import { renderTemplate } from '@/lib/template';

const TONES = ['concise','friendly','authoritative','curious','playful','direct'] as const;
const LENGTHS = ['short','medium','long'] as const;

export function TemplateRewriter({
  initialSubject = 'Quick intro for {{first_name}}',
  initialHtml = `<p>Hi {{first_name}},</p><p>I noticed {{company}} is scaling. We help teams book more qualified calls via SmartSend AI. Interested in a 10-min chat?</p><p>— Julian</p>`,
  sampleLead = { first_name: 'Ava', company: 'Acme Co' }
}: {
  initialSubject?: string;
  initialHtml?: string;
  sampleLead?: Record<string,string>;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [html, setHtml] = useState(initialHtml);
  const [tone, setTone] = useState<typeof TONES[number]>('concise');
  const [length, setLength] = useState<typeof LENGTHS[number]>('short');
  const [extras, setExtras] = useState('');
  const [loading, setLoading] = useState(false);

  const previewSubject = useMemo(() => renderTemplate(subject, sampleLead), [subject, sampleLead]);
  const previewHtml = useMemo(() => renderTemplate(html, sampleLead), [html, sampleLead]);

  async function rewrite() {
    setLoading(true);
    const r = await fetch('/api/ai/rewrite', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ subject, body_html: html, tone, length, extras })
    });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { 
      alert(j.error || 'Rewrite failed'); 
      return; 
    }
    setSubject(j.subject);
    setHtml(j.body_html);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor */}
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium">Subject</label>
            <input
              value={subject}
              onChange={(e)=>setSubject(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
              placeholder="Subject with {{first_name}}"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Tone</label>
            <select value={tone} onChange={e=>setTone(e.target.value as any)} className="border rounded-xl px-3 py-2">
              {TONES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Length</label>
            <select value={length} onChange={e=>setLength(e.target.value as any)} className="border rounded-xl px-3 py-2">
              {LENGTHS.map(l=><option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Body (HTML supports {{tokens}})</label>
          <textarea
            value={html}
            onChange={(e)=>setHtml(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 min-h-[260px] font-mono"
          />
          <div className="text-xs text-gray-500 mt-1">
            Tip: Keep <code>{'{{first_name}}'}</code>, <code>{'{{company}}'}</code> intact — the AI will preserve them.
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Extra guidance (optional)</label>
          <input
            value={extras}
            onChange={(e)=>setExtras(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
            placeholder="e.g., add social proof from 2 SaaS clients; 1 CTA only."
          />
        </div>

        <button
          onClick={rewrite}
          disabled={loading}
          className="px-4 py-2 rounded-2xl bg-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Rewriting…' : 'Rewrite with AI'}
        </button>
      </div>

      {/* Live Preview (sample lead) */}
      <div className="space-y-3">
        <div>
          <div className="text-sm text-gray-600">Preview subject</div>
          <div className="text-lg font-semibold">{previewSubject}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        <details className="text-xs text-gray-600">
          <summary>Preview variables</summary>
          <pre className="p-3 bg-gray-50 rounded-xl">{JSON.stringify(sampleLead, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
