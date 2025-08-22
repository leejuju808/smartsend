"use client";
import { useState } from "react";

export default function DeliverabilityWizard({ defaultDomain = "" }: { defaultDomain?: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [toEmail, setToEmail] = useState("");

  async function runCheck() {
    if (!domain) return;
    setLoading(true); setRes(null);
    const r = await fetch(`/api/deliverability/check?domain=${encodeURIComponent(domain)}`);
    const j = await r.json();
    setRes(j); setLoading(false);
  }

  async function sendTest() {
    const r = await fetch(`/api/deliverability/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: toEmail || undefined }),
    });
    const j = await r.json();
    if (j?.ok) alert("Test email sent! Check your Inbox/Spam in ~1–2 minutes.");
    else alert(`Send failed: ${j?.error || "unknown"}`);
  }

  const score = res?.score ?? 0;

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs text-gray-600">Your sending domain</label>
          <input
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="example.com"
            className="mt-1 w-full rounded-xl border p-2"
          />
        </div>
        <button onClick={runCheck} disabled={loading || !domain} className="self-end rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">
          {loading ? "Checking…" : "Check DNS"}
        </button>
      </div>

      {res && (
        <div className="space-y-4">
          <ScoreBar score={score} />
          <Findings title="MX" data={res.mx} />
          <Findings title="SPF" data={res.spf} />
          <Findings title="DKIM" data={res.dkim} />
          <Findings title="DMARC" data={res.dmarc} />

          <div className="rounded-xl border p-4">
            <div className="text-sm font-medium">Send a test email</div>
            <p className="mt-1 text-xs text-gray-600">We’ll send a simple message via your SMTP/ESP.</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
                placeholder="you@company.com (optional, defaults to your account email)"
                className="rounded-xl border p-2 flex-1"
              />
              <button onClick={sendTest} className="rounded-2xl border px-4 py-2">Send test</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between text-sm">
        <span>Deliverability score</span>
        <span>{score}/100</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-black" style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Aim for SPF ✅, DKIM ✅, and DMARC ✅. If DMARC is <code>p=none</code>, consider <code>p=quarantine</code> or <code>p=reject</code>.
      </p>
    </div>
  );
}

function Findings({ title, data }: { title: string; data: any }) {
  const color = data?.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200";
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-sm font-medium">{title}: {data?.ok ? "OK" : "Issue"}</div>
      {data?.warning && <div className="mt-1 text-xs">⚠️ {data.warning}</div>}
      {data?.details && <div className="mt-1 text-xs">{data.details}</div>}
      {data?.error && <div className="mt-1 text-xs">Error: {data.error}</div>}
      {Array.isArray(data?.found) && data.found.length > 0 && (
        <ul className="mt-2 text-xs list-disc pl-5">
          {data.found.map((f: string, i: number) => <li key={i} className="break-all">{f}</li>)}
        </ul>
      )}
    </div>
  );
}

