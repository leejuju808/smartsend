"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  title: string;
  snapshot: { city?: string; state?: string; company_size_range?: string; time_using_smartsend_days?: number };
  results: Array<{ label: string; value: any }>;
};

function titleCase(s: string) {
  return s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CaseStudyCarousel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/demo/case-studies", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed");
        if (alive) setItems(json.items || []);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-semibold">Proof (Approved Case Studies)</div>
        <div className="text-sm text-gray-500 mt-2">Loading…</div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Proof (Approved Case Studies)</div>
          <div className="text-xs text-gray-500 mt-1">Real wins. Anonymized. Approval-gated.</div>
        </div>
        <div className="text-xs text-gray-500">Scroll</div>
      </div>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {items.map((cs) => {
          const loc = [cs.snapshot?.city, cs.snapshot?.state].filter(Boolean).join(", ") || "—";
          const size = cs.snapshot?.company_size_range || "—";
          const topResults = (cs.results || []).slice(0, 3);
          return (
            <div key={cs.id} className="min-w-[320px] max-w-[320px] rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{cs.title}</div>
              <div className="text-xs text-slate-600 mt-1">
                {loc} • {size} people
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-800">
                {topResults.length === 0 ? (
                  <div className="text-slate-600">—</div>
                ) : (
                  topResults.map((r, idx) => (
                    <div key={idx}>
                      <span className="font-medium">{titleCase(String(r.label || "Result"))}:</span>{" "}
                      <span>{String(r.value ?? "—")}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}









