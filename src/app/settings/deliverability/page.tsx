"use client";
import { useEffect, useState } from "react";

type Result = {
  domain: string;
  spf: { found: boolean; record: string|null; issues: string[] };
  dmarc: { found: boolean; record: string|null; issues: string[] };
  dkim: { any: boolean; selectors: Record<string,{found:boolean;record:string|null;issues:string[]}> };
};

export default function DeliverabilityPage() {
  const userId = "REPLACE_WITH_AUTHED_USER_ID"; // wire auth
  const [domain, setDomain] = useState("");
  const [selector, setSelector] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/mailbox/me?userId=${userId}`);
        const j = await r.json();
        if (r.ok && j.domain) setDomain(j.domain);
      } catch {}
    })();
  }, [userId]);

  async function runCheck() {
    setLoading(true); setErr(null); setRes(null);
    try {
      const qs = new URLSearchParams({ domain, ...(selector ? { selector } : {}) });
      const r = await fetch(`/api/deliverability/check?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Check failed");
      setRes(j);
    } catch (e:any) { setErr(String(e.message || e)); } finally { setLoading(false); }
  }

  const Badge = ({ ok }: { ok: boolean }) =>
    <span className={`px-2 py-1 text-xs rounded-full ${ok ? "bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{ok?"OK":"Fix"}</span>;

  return (
    <div className="p-6 grid gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">Deliverability Check</h1>

      <div className="rounded-2xl border p-4 grid gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Sending domain">
            <input className="border rounded-xl px-3 py-2 w-full" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="yourdomain.com" />
          </Field>
          <Field label="DKIM selector (optional)">
            <input className="border rounded-xl px-3 py-2 w-full" value={selector} onChange={e=>setSelector(e.target.value)} placeholder="selector1 / google / default" />
          </Field>
        </div>
        <div>
          <button onClick={runCheck} disabled={!domain || loading} className="rounded-xl bg-black text-white px-4 py-2">
            {loading ? "Checking…" : "Run Check"}
          </button>
          {err && <span className="ml-3 text-sm text-red-600">{err}</span>}
        </div>
      </div>

      {res && (
        <div className="grid gap-4">
          {/* SPF */}
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">SPF (@ {res.domain})</h2>
              <Badge ok={res.spf.found && res.spf.issues.length === 0} />
            </div>
            <Mono text={res.spf.record || "—"} />
            {!!res.spf.issues.length && <Issues list={res.spf.issues} />}
            {!res.spf.found && (
              <Suggestion title="Add SPF" lines={[
                `Host: @`,
                `Type: TXT`,
                `Value: v=spf1 include:_spf.google.com ~all    # if Gmail/Workspace`,
                `      v=spf1 include:YOUR_PROVIDER ~all       # otherwise`,
              ]} />
            )}
          </div>

          {/* DMARC */}
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">DMARC (_dmarc.{res.domain})</h2>
              <Badge ok={res.dmarc.found && res.dmarc.issues.length === 0} />
            </div>
            <Mono text={res.dmarc.record || "—"} />
            {!!res.dmarc.issues.length && <Issues list={res.dmarc.issues} />}
            {!res.dmarc.found && (
              <Suggestion title="Add DMARC" lines={[
                `Host: _dmarc`,
                `Type: TXT`,
                `Value: v=DMARC1; p=quarantine; adkim=s; aspf=s; pct=100; rua=mailto:dmarc@${res.domain}; fo=1`
              ]} />
            )}
          </div>

          {/* DKIM */}
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">DKIM (selector._domainkey.{res.domain})</h2>
              <Badge ok={res.dkim.any} />
            </div>
            <div className="mt-2 grid gap-2">
              {Object.entries(res.dkim.selectors).map(([sel, v]) => (
                <div key={sel} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm"><b>{sel}</b>._domainkey.{res.domain}</div>
                    <Badge ok={v.found && v.issues.length === 0} />
                  </div>
                  <Mono text={v.record || "—"} />
                  {!!v.issues.length && <Issues list={v.issues} />}
                </div>
              ))}
            </div>
            {!res.dkim.any && (
              <div className="mt-2 text-xs text-gray-600">
                Your provider (Google Workspace, Brevo, Mailgun, etc.) issues the DKIM record (selector + p= key). Add it in DNS.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }:{label:string; children:any}) {
  return <label className="text-sm">{<div className="text-gray-600 mb-1">{label}</div>}{children}</label>;
}

function Mono({ text }:{ text:string }) {
  return <pre className="mt-2 text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto">{text}</pre>;
}

function Issues({ list }:{ list:string[] }) {
  return (
    <ul className="mt-2 text-xs text-red-700 list-disc ml-5">
      {list.map((x,i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

function Suggestion({ title, lines }:{ title:string; lines:string[] }) {
  return (
    <div className="mt-3 text-xs border rounded-xl p-3 bg-yellow-50">
      <div className="font-medium mb-1">{title}</div>
      <pre className="whitespace-pre-wrap">{lines.join("\n")}</pre>
    </div>
  );
}

