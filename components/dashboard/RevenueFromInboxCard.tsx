// Block 20070 — Revenue From Inbox Card

"use client";

import { useEffect, useState } from "react";

export function RevenueFromInboxCard() {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/inbox/revenue/summary");
      const json = await res.json();
      setTotal(json.month_total ?? 0);
    } catch (error) {
      console.error("Error loading revenue summary:", error);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-4 bg-white rounded-xl border">
      <p className="text-xs text-gray-500 uppercase tracking-wide">
        Closed from SmartSend
      </p>
      <p className="mt-1 text-2xl font-semibold">
        {loading ? "—" : total === null ? "—" : `$${total.toLocaleString()}`}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Jobs marked won this month from SmartSend replies.
      </p>
    </div>
  );
}

















































