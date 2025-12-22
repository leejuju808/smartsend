'use client'

import { useState } from "react"

const TONES = ["friendly","direct","authoritative","playful","casual","formal"]
const LENGTHS = ["short","medium","long"]

export default function TemplateRewriter() {
  const [subject, setSubject] = useState("{{company}} × {{first_name}} — quick idea")
  const [body, setBody] = useState(
`Hi {{first_name}},

Noticed {{company}} is {{pain_point}}. We recently helped {{peer_company}} {{outcome}}.

If I drafted a 2-step plan tailored to {{company}}, would you take a quick look?

Best,

{{sender_name}}
{{sender_title}}

`
  )
  const [tone, setTone] = useState("friendly")
  const [length, setLength] = useState("short")
  const [loading, setLoading] = useState(false)
  const [variants, setVariants] = useState<{subject:string; body:string}[]>([])

  const runRewrite = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, tone, length, variations: 3, spam_safe: true })
      })
      const j = await r.json()
      setVariants(j.variants ?? [])
    } finally {
      setLoading(false)
    }
  }

  const copy = (txt: string) => navigator.clipboard.writeText(txt)

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Smart Template Rewriter</h1>
        <p className="text-sm text-muted-foreground">Generate high-performing, spam-safe variants. Merge tags are preserved.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-sm">Subject</label>
          <input
            className="w-full rounded-xl border p-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <label className="text-sm">Body</label>
          <textarea
            className="w-full h-64 rounded-xl border p-2"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex gap-3">
            <select className="rounded-xl border p-2" value={tone} onChange={(e)=>setTone(e.target.value)}>
              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="rounded-xl border p-2" value={length} onChange={(e)=>setLength(e.target.value)}>
              {LENGTHS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={runRewrite}
              disabled={loading}
              className="px-4 py-2 rounded-xl border hover:bg-accent"
            >
              {loading ? "Rewriting…" : "Rewrite (×3)"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tips: keep merge tags like <code className="bg-gray-100 px-1 rounded">{'{{first_name}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{company}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{sender_name}}'}</code>.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Variants</h2>
          {variants.length === 0 ? (
            <div className="text-sm text-muted-foreground">No variants yet — click "Rewrite (×3)".</div>
          ) : (
            <ul className="space-y-3">
              {variants.map((v, i) => (
                <li key={i} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Variant {i+1}</div>
                    <div className="flex gap-2">
                      <button onClick={()=>copy(v.subject)} className="text-xs px-2 py-1 rounded border">Copy subject</button>
                      <button onClick={()=>copy(v.body)} className="text-xs px-2 py-1 rounded border">Copy body</button>
                    </div>
                  </div>
                  <div className="text-sm"><span className="font-semibold">Subject:</span> {v.subject}</div>
                  <pre className="text-sm whitespace-pre-wrap">{v.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

