"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Counts = { all: number; needs: number; interested: number; system: number };

export function TriageTabs({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = sp.get("tab") || "all";
  const [counts, setCounts] = useState<Counts>({
    all: 0,
    needs: 0,
    interested: 0,
    system: 0,
  });

  // Fetch counts only (cheap): hit /api/inbox without pagination impact
  useEffect(() => {
    const p = new URLSearchParams();
    if (campaignId) p.set("campaign_id", campaignId);
    fetch(`/api/inbox?${p.toString()}`)
      .then((r) => r.json())
      .then((j) => j?.counts && setCounts(j.counts))
      .catch(() => {});
  }, [campaignId]);

  function push(next: string) {
    const p = new URLSearchParams(sp.toString());
    if (next === "all") p.delete("tab");
    else p.set("tab", next);
    router.push(`?${p.toString()}`);
  }

  const Item = ({ k, label, n }: { k: string; label: string; n: number }) => (
    <button
      onClick={() => push(k)}
      className={`px-3 py-1.5 text-sm rounded-md border ${
        tab === k
          ? "bg-muted"
          : "bg-background hover:bg-muted/60"
      }`}
    >
      <span>{label}</span>
      <span className="ml-2 text-xs rounded-full px-2 py-0.5 border">
        {n}
      </span>
    </button>
  );

  return (
    <div className="flex gap-2">
      <Item k="all" label="All" n={counts.all} />
      <Item k="needs" label="Needs Reply" n={counts.needs} />
      <Item k="interested" label="Interested" n={counts.interested} />
      <Item k="system" label="Unsub / OOO / Bounce" n={counts.system} />
    </div>
  );
}

