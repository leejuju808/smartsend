"use client";

import { useState } from "react";

interface StopOnReplyToggleProps {
  campaign: {
    id: string;
    stop_on_reply?: boolean | null;
  };
}

export function StopOnReplyToggle({ campaign }: StopOnReplyToggleProps) {
  const [value, setValue] = useState(!!campaign.stop_on_reply);
  const [loading, setLoading] = useState(false);

  async function save(newValue: boolean) {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_on_reply: newValue })
      });
      if (!r.ok) throw new Error("Failed to save");
      setValue(newValue);
    } catch (e) {
      console.error("Failed to update stop_on_reply:", e);
      alert("Failed to save setting. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        disabled={loading}
        onChange={(e) => save(e.target.checked)}
        className="cursor-pointer"
      />
      <span>Stop sequence on reply</span>
    </label>
  );
}





