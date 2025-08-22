"use client";
import { useState } from "react";

export default function SendButtonWithQuota({ payload }: { payload: any }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setLoading(true); setErr(null);
    const pre = await fetch("/api/usage/check-increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: { source: "ui_send_button", ...(payload?.meta || {}) } }),
    });
    const res = await pre.json();

    if (pre.status === 402) {
      const url = res?.redirectTo || "/dashboard/billing";
      setErr("You've hit the Free plan limit.");
      window.location.href = url;
      return;
    }
    if (!res?.ok) {
      setErr("Could not send right now.");
      setLoading(false);
      return;
    }

    // If you separate logging from sending, call your actual sender here.
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={loading}
        onClick={onClick}
        className="rounded-2xl px-4 py-2 bg-black text-white disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

