// components/inbox/LabelFilter.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = ["All","positive","neutral","negative","unsubscribe","ooo","bounce","other"];

export function LabelFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("label") ?? "All";
  
  return (
    <select
      className="border rounded-md text-sm px-2 py-1"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        const p = new URLSearchParams(sp.toString());
        if (v === "All") p.delete("label"); else p.set("label", v);
        router.push(`?${p.toString()}`);
      }}
    >
      {OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}





