"use client";

import { useState } from "react";

interface RespectSuppressionToggleProps {
  campaign: {
    id: string;
    respect_suppression?: boolean | null;
  };
}

export function RespectSuppressionToggle({ campaign }: RespectSuppressionToggleProps) {
  const [value, setValue] = useState(campaign.respect_suppression !== false);
  const [loading, setLoading] = useState(false);

  async function save(newValue: boolean) {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respect_suppression: newValue })
      });
      if (!r.ok) throw new Error("Failed to save");
      setValue(newValue);
    } catch (e) {
      console.error("Failed to update respect_suppression:", e);
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
      <span>Respect global suppression list</span>
    </label>
  );
}





