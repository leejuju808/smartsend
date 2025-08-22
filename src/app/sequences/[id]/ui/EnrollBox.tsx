"use client";
import { useState } from "react";

export default function EnrollBox({ sequenceId, userId }:{ sequenceId:string; userId:string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function enroll() {
    setLoading(true); setMsg(null);
    try {
      // quick policy check
      const pol = await fetch(`/api/sending/policy?userId=${userId}`, { cache: "no-store" }).then(r=>r.json());
      if (pol?.atCap) {
        setMsg("You’re at today’s cap. Upgrade or try again tomorrow.");
        return;
      }

      const emails = text.split(/[\s,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
      if (!emails.length) return;
      // ensure leads exist (upsert)
      const leadIds: string[] = [];
      for (const email of emails) {
        const r = await fetch("/api/leads/upsert", {
          method:"POST", headers:{ "content-type":"application/json" },
          body: JSON.stringify({ userId, email })
        });
        const j = await r.json(); if (r.ok) leadIds.push(j.id);
      }
      const r2 = await fetch(`/api/sequences/${sequenceId}/enroll?userId=${userId}`, {
        method:"POST", headers:{ "content-type":"application/json" },
        body: JSON.stringify({ leadIds, startNow: true })
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2?.error || "Enrollment failed");
      setMsg(`Enrolled ${leadIds.length} lead(s). First send ~ ${new Date(j2.scheduled_for).toLocaleString()}`);
      setText("");
    } catch (e:any) {
      setMsg(e.message || String(e));
    } finally { setLoading(false); }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-600 mb-2">Enroll leads (paste emails)</div>
      <textarea
        className="w-full border rounded-xl px-3 py-2 h-28"
        placeholder="alice@acme.com, bob@northstar.io …"
        value={text} onChange={e=>setText(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button onClick={enroll} disabled={loading} className="rounded-xl bg-black text-white px-4 py-2">
          {loading ? "Enrolling…" : "Enroll & Send"}
        </button>
        {msg && <span className="text-xs text-gray-700">{msg}</span>}
      </div>
      <p className="mt-1 text-xs text-gray-500">We’ll schedule at ~10:05am in each lead’s timezone (guessed from email TLD if missing) and respect your quiet hours.</p>
    </div>
  );
}

