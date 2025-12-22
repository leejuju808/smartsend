"use client";

import { useState } from "react";

export function MarkAsHandledButton({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false);
  const [handled, setHandled] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/mark-handled`, {
        method: "POST",
      });

      if (res.ok) {
        setHandled(true);
      } else {
        alert("Failed to mark as handled");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to mark as handled");
    } finally {
      setLoading(false);
    }
  }

  if (handled) {
    return (
      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
        ✓ Handled
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50"
    >
      {loading ? "..." : "Mark as Handled"}
    </button>
  );
}

