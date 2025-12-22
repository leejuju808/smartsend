"use client";

import * as React from "react";

export function UnlinkedBadge() {
  const [count, setCount] = React.useState<number>(0);

  const refresh = React.useCallback(async () => {
    const r = await fetch("/api/normalized/unlinked-count", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setCount(j.count ?? 0);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!count) return null;

  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
      {count} unlinked
    </span>
  );
}


