"use client";
import { useState, useEffect } from "react";

interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  created_at: string;
  verified_at?: string;
}

export default function DomainClaimCard() {
  const [domain, setDomain] = useState("");
  const [msg, setMsg] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [evEmail, setEvEmail] = useState("");
  const [evStep, setEvStep] = useState<"enter"|"code">("enter");
  const [evCode, setEvCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  async function claim() {
    setMsg("Creating claim…");
    const r = await fetch("/api/domains/claim", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ domain })
    });
    const j = await r.json();
    if (r.ok) {
      setMsg(j.instructions);
      setDomain(""); // Clear input
      loadDomains(); // Refresh the list
    } else {
      setMsg(j.error || "Error");
    }
  }

  async function verify() {
    setMsg("Verifying…");
    const r = await fetch("/api/domains/verify", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ domain })
    });
    const j = await r.json();
    if (j.ok) {
      setMsg("✅ Verified! New users with this domain will auto-join your team.");
      loadDomains(); // Refresh the list
    } else {
      setMsg("TXT not found yet.");
    }
  }

  async function emailRequest() {
    setBusy(true); setMsg("");
    const email = evEmail || `owner@${domain}`;
    const r = await fetch("/api/domains/email/request", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email })
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error || "Error sending code."); return; }
    setEvStep("code");
  }

  async function emailVerify() {
    setBusy(true); setMsg("");
    const email = evEmail || `owner@${domain}`;
    const r = await fetch("/api/domains/email/verify", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email, code: evCode })
    });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `✅ ${j.domain} verified by email. Auto-join enabled.` : (j.error || "Invalid code"));
    if (r.ok) {
      setShowEmail(false);
      loadDomains(); // Refresh the list
    }
  }

  async function loadDomains() {
    try {
      const r = await fetch("/api/domains/list");
      const j = await r.json();
      if (r.ok) {
        setDomains(j.domains || []);
      }
    } catch (error) {
      console.error("Failed to load domains:", error);
    }
  }

  useEffect(() => {
    loadDomains().finally(() => setLoading(false));
  }, []);

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">Company Domain</h3>
      <p className="text-sm text-gray-600">
        Claim your domain to auto-join teammates (e.g. <b>company.com</b>). Verify by DNS (best) or quick email (fast).
      </p>
      <div className="flex gap-2">
        <input 
          className="border rounded px-3 py-2 flex-1" 
          placeholder="company.com" 
          value={domain} 
          onChange={e=>setDomain(e.target.value)} 
        />
        <button onClick={claim} className="px-3 py-2 rounded border">DNS Claim</button>
        <button onClick={verify} className="px-3 py-2 rounded border">DNS Verify</button>
        <button onClick={()=>setShowEmail(true)} className="px-3 py-2 rounded bg-black text-white">Email Verify</button>
      </div>
      {!!msg && <p className="text-xs text-gray-500 whitespace-pre-wrap">{msg}</p>}
      
      {/* Existing Domains */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading domains...</div>
      ) : domains.length > 0 ? (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Your Domains:</h4>
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span className="font-mono">{d.domain}</span>
              <span className={`px-2 py-1 rounded text-xs ${
                d.verified 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {d.verified ? '✅ Verified' : '⏳ Pending'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">No domains claimed yet.</div>
      )}

      {showEmail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Verify by email</h4>
              <button onClick={()=>setShowEmail(false)} className="text-sm">✕</button>
            </div>

            {evStep === "enter" && (
              <>
                <p className="text-sm text-gray-600">
                  We'll send a 6-char code to any mailbox at <b>@{domain || "yourdomain.com"}</b>.
                </p>
                <input className="border rounded px-3 py-2 w-full"
                       placeholder={`owner@${domain || "company.com"}`}
                       value={evEmail}
                       onChange={e=>setEvEmail(e.target.value)} />
                <button disabled={busy}
                        onClick={emailRequest}
                        className="px-4 py-2 rounded bg-black text-white w-full">
                  {busy ? "Sending…" : "Send code"}
                </button>
              </>
            )}

            {evStep === "code" && (
              <>
                <p className="text-sm text-gray-600">Enter the code we emailed to <b>{evEmail || `owner@${domain}`}</b>.</p>
                <input className="border rounded px-3 py-2 w-full tracking-widest uppercase"
                       placeholder="ABC123"
                       value={evCode}
                       onChange={e=>setEvCode(e.target.value.toUpperCase())} />
                <button disabled={busy}
                        onClick={emailVerify}
                        className="px-4 py-2 rounded bg-black text-white w-full">
                  {busy ? "Verifying…" : "Verify"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 