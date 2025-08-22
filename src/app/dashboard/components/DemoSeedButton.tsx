"use client";
import { useState } from "react";

export default function DemoSeedButton({ userId, onDone }: { userId: string; onDone?: (m: { sent: number; open: number; reply: number }) => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function seed() {
    setLoading(true);
    try {
      const r = await fetch("/api/demo-seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = await r.json();
      if (j?.ok) {
        setDone(true);
        onDone?.(j.metrics || { sent: 5, open: 3, reply: 1 });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={seed}
      disabled={loading || done}
      className="rounded-xl px-4 py-2 bg-black text-white"
      title="Seeds demo leads, a demo campaign, and sample metrics"
    >
      {done ? "Demo Ready ✅" : loading ? "Seeding…" : "✨ Launch Demo Campaign"}
    </button>
  );
}