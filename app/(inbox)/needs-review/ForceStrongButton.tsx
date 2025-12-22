"use client";

import { useState } from "react";

type ForceStrongButtonProps = {
  threadId: string;
};

export function ForceStrongButton({ threadId }: ForceStrongButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      await fetch("/api/replies/reclassify-strong", {
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
      {loading ? "Running..." : "Reclassify (Strong)"}
    </button>
  );
}

