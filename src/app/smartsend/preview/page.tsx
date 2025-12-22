"use client";
import { useState } from "react";

export default function TemplatePreviewPage() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Quick idea for {{company|your team}}");
  const [body, setBody] = useState(
    "Hey {{first_name|there}},\n\nSaw {{company}} is scaling — SmartSend helps reply within minutes.\nWant a 2-min demo?"
  );
  const [out, setOut] = useState<{subject:string; body_html:string} | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    setLoading(true); setOut(null);
    try {
      const res = await fetch("/api/smartsend/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_email: email, subject, body }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setOut(data.preview);
    } catch (e:any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] px-4 py-8 text-white">
      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-6">
          <h1 className="text-2xl font-semibold mb-2">Template Preview</h1>
          <p className="text-sm text-zinc-400 mb-4">Use <code>{"{{first_name|default}}"}</code>, <code>{"{{company}}"}</code>, or triple braces <code>{"{{{raw_html}}}"}</code>.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Tokens with defaults like <code>{"{{first_name|there}}"}</code> won't be flagged as missing.
          </p>

          <div className="space-y-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.com"
              className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
              type="email"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
            />
            <textarea
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
            />
            <button
              onClick={preview}
              disabled={loading || !email}
              className="w-full rounded-2xl py-2 font-semibold bg-yellow-400 text-black disabled:opacity-60"
            >
              {loading ? "Rendering…" : "Preview"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-black/70 p-6">
          <h2 className="text-lg font-semibold mb-3">Output</h2>
          {out ? (
            <>
              <div className="mb-3">
                <div className="text-xs text-zinc-400 mb-1">Subject</div>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2">{out.subject}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Body (HTML)</div>
                <iframe
                  className="w-full h-64 rounded-lg border border-zinc-800 bg-white"
                  srcDoc={out.body_html}
                />
              </div>
            </>
          ) : (
            <div className="text-zinc-400">No preview yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}