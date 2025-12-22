"use client";

import { useState } from "react";

type ResolveButtonProps = {
  threadId: string;
};

export function ResolveButton({ threadId }: ResolveButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      await fetch("/api/replies/review/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="rounded-full border px-3 py-1 text-xs"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "Saving..." : "Mark Resolved"}
    </button>
  );
}

