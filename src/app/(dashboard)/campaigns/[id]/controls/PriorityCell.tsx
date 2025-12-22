"use client";

import { useState } from "react";
import { boostPriority } from "./actions";
import { toast } from "sonner";

export function PriorityCell({ id, current }: { id: string; current: number }) {
  const [p, setP] = useState(current ?? 0);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        value={p}
        onChange={(e) => setP(Number(e.target.value))}
        className="w-16 rounded-xl border px-2 py-1 text-sm"
      />
      <button
        className="rounded-xl border px-2 py-1 text-xs hover:bg-gray-50"
        onClick={async () => {
          const fd = new FormData();
          fd.append("queueId", id);
          fd.append("priority", String(p));
          try {
            await boostPriority(null, fd);
            toast.success("Priority updated");
          } catch (e: any) {
            toast.error(e.message || "Failed to update priority");
          }
        }}
      >
        Boost
      </button>
    </div>
  );
}

