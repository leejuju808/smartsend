"use client";
import { useState } from "react";

export default function RunDispatcherButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="rounded-2xl px-4 py-2 bg-black text-white disabled:opacity-50"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await fetch("/api/dispatcher/run", { method: "POST" });
          const j = await r.json().catch(() => ({}));
          alert(r.ok ? `Queued: ${JSON.stringify(j.results)}` : `Error: ${j.error || r.statusText}`);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Dispatching…" : "Run Dispatcher Now"}
    </button>
  );
}


