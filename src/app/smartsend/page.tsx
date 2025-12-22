"use client";
import { useState } from "react";

export default function SmartSendPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<string>("");

  async function schedule() {
    setLoading(true);
    setOut("");
    try {
      const res = await fetch("/api/smartsend/schedule-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_email: email, name: "Demo Sequence" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setOut(`Scheduled ${data.jobs.length} steps. First run at ${new Date(data.jobs[0].run_at).toLocaleTimeString()}.`);
    } catch (e:any) {
      setOut(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 text-white">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-black/80 p-6">
        <h1 className="text-2xl font-semibold mb-2">SmartSend — Sequence Scheduler v0</h1>
        <p className="text-sm text-zinc-400 mb-6">Create a demo 2-step sequence and queue jobs.</p>

        <div className="space-y-3">
          <input
            placeholder="contact@example.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
            type="email"
          />
          <button
            onClick={schedule}
            disabled={loading || !email}
            className="w-full rounded-2xl py-2 font-semibold bg-yellow-400 text-black disabled:opacity-60"
          >
            {loading ? "Scheduling…" : "Schedule Test"}
          </button>
          {out && <div className="text-sm text-zinc-300 mt-2">{out}</div>}
        </div>
      </div>
    </div>
  );
}