"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";

function useDebounced<T>(val: T, ms: number) {
  const [v, setV] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setV(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return v;
}

export function SearchAndFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") || "");
  const deb = useDebounced(q, 300);

  const status = sp.get("status") || "any";
  const hasAttach = sp.get("has_attach") === "1";
  const dateFrom = sp.get("date_from") || "";
  const dateTo = sp.get("date_to") || "";

  useEffect(() => {
    const p = new URLSearchParams(sp.toString());
    if (deb) p.set("q", deb);
    else p.delete("q");
    router.push(`?${p.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deb]);

  function setParam(k: string, v?: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (!v) p.delete(k);
    else p.set(k, v);
    router.push(`?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[220px]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search subject or body…"
          className="w-full"
        />
      </div>

      {/* Status chip */}
      <select
        className="border rounded-md text-sm px-2 py-2 bg-background"
        value={status}
        onChange={(e) =>
          setParam("status", e.target.value === "any" ? null : e.target.value)
        }
      >
        <option value="any">Any status</option>
        <option value="open">Open</option>
        <option value="snoozed">Snoozed</option>
        <option value="closed">Closed</option>
      </select>

      {/* Attachments */}
      <button
        className={`text-sm border rounded-md px-2 py-2 ${
          hasAttach ? "bg-muted" : "bg-background hover:bg-muted/60"
        }`}
        onClick={() => setParam("has_attach", hasAttach ? null : "1")}
      >
        Has attachment
      </button>

      {/* Date range */}
      <input
        type="date"
        className="border rounded-md px-2 py-2 text-sm bg-background"
        value={dateFrom}
        onChange={(e) => setParam("date_from", e.target.value || null)}
      />
      <span className="text-xs opacity-70">to</span>
      <input
        type="date"
        className="border rounded-md px-2 py-2 text-sm bg-background"
        value={dateTo}
        onChange={(e) => setParam("date_to", e.target.value || null)}
      />

      {/* Clear */}
      <button
        className="text-sm border rounded-md px-2 py-2 hover:bg-muted/60 bg-background"
        onClick={() => router.push("?")}
      >
        Clear
      </button>
    </div>
  );
}





