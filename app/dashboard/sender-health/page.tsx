"use client";

import { useEffect, useState } from "react";

type CheckResp = {
  ok: boolean;
  from_address: string;
  allowed_to_send: boolean;
  today_sent: number;
  today_limit: number;
  ramp_stage: number;
  health: "green" | "yellow" | "red";
  bounce_rate_30d: number;
  reasons: string[];
  error?: string;
};

export default function SenderHealthPage() {
  const [fromAddr, setFromAddr] = useState("");
  const [resp, setResp] = useState<CheckResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    if (!fromAddr) return;
    setLoading(true);
    setResp(null);
    try {
      const res = await fetch("/api/send-safety/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_address: fromAddr }),
      });
      const json = (await res.json()) as CheckResp;
      setResp(json);
    } catch (e: any) {
      setResp({ ok: false, from_address: fromAddr, allowed_to_send: false, today_sent: 0, today_limit: 0, ramp_stage: 0, health: "red", bounce_rate_30d: 0, reasons: [`${e.message}`] });
    } finally {
      setLoading(false);
    }
  }

  const badge = (h: string) => {
    const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium";
    if (h === "green") return <span className={`${base} bg-green-50 text-green-700`}>● Healthy</span>;
    if (h === "yellow") return <span className={`${base} bg-yellow-50 text-yellow-700`}>● Watchlist</span>;
    return <span className={`${base} bg-red-50 text-red-700`}>● Risk</span>;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sender Health</h1>
        <p className="text-sm text-gray-500">Bounce-rate guard + send ramp. Keep your domain safe and warm up steadily.</p>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={fromAddr}
          onChange={(e) => setFromAddr(e.target.value)}
          placeholder="from@yourdomain.com"
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm w-80"
        />
        <button
          onClick={check}
          disabled={loading || !fromAddr}
          className="px-4 py-2 rounded-xl bg-black text-white text-sm"
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </div>

      {resp && (
        <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">{resp.from_address}</div>
              <div className="text-sm text-gray-500">
                Ramp stage {resp.ramp_stage} • {resp.today_sent}/{resp.today_limit} sent today
              </div>
            </div>
            <div>{badge(resp.health)}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Allowed to Send" value={resp.allowed_to_send ? "Yes" : "No"} />
            <Metric label="30d Bounce Rate" value={(resp.bounce_rate_30d * 100).toFixed(2) + "%"} />
            <Metric label="Today Limit" value={String(resp.today_limit)} />
            <Metric label="Today Sent" value={String(resp.today_sent)} />
          </div>

          {resp.reasons?.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Notes</div>
              <ul className="list-disc pl-5 text-sm">
                {resp.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}