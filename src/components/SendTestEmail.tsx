// components/SendTestEmail.tsx
"use client";

import { useState } from "react";

export default function SendTestEmail() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("SmartSend — Test Email");
  const [previewText, setPreviewText] = useState("SmartSend test delivery");
  const [body, setBody] = useState("If you can read this, your test email works!");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, previewText, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send");
      setResult(`Sent! id=${json.id ?? "n/a"}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 max-w-xl">
      <div className="text-xl font-semibold mb-2">Send Test Email</div>
      <p className="text-sm text-neutral-400 mb-4">
        Use this to verify delivery from SmartSend. No billing required.
      </p>

      <label className="block text-sm mb-1">To</label>
      <input
        className="w-full mb-3 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
        placeholder="you@example.com"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        type="email"
      />

      <label className="block text-sm mb-1">Subject</label>
      <input
        className="w-full mb-3 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <label className="block text-sm mb-1">Preview Text</label>
      <input
        className="w-full mb-3 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
        value={previewText}
        onChange={(e) => setPreviewText(e.target.value)}
      />

      <label className="block text-sm mb-1">Body</label>
      <textarea
        className="w-full h-28 mb-4 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/40"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <button
        onClick={handleSend}
        disabled={loading || !to}
        className="w-full rounded-2xl bg-yellow-400/90 text-black font-semibold py-2 hover:bg-yellow-300 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send Test Email"}
      </button>

      {result && <div className="mt-3 text-green-400 text-sm">{result}</div>}
      {error && <div className="mt-3 text-red-400 text-sm">Error: {error}</div>}
    </div>
  );
}