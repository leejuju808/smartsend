"use client";

import { useState } from "react";
import { detectMeetingIntent } from "@/lib/meetings/intent";

type Props = {
  composerText: string;
  onInsert: (insertion: { text: string; icsUrl?: string }) => void;
  organizerEmail: string;
};

export default function SmartMeetingInsert({ composerText, onInsert, organizerEmail }: Props) {
  const [loading, setLoading] = useState(false);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;

  const handleInsert = async () => {
    setLoading(true);
    try {
      // propose a start time 24h from now at 10:00 local
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(10, 0, 0, 0);

      const res = await fetch("/api/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startISO: start.toISOString(),
          organizerEmail,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate invite");
      const icsBlob = await res.blob();
      const icsUrl = URL.createObjectURL(icsBlob);

      const insertionText = [
        "Great—happy to connect! ",
        calendly ? `Here's my booking link: ${calendly}. ` : "",
        "I've also attached a calendar invite for a tentative slot tomorrow at 10:00.",
      ].join("");

      onInsert({ text: insertionText, icsUrl });
    } catch (e) {
      onInsert({ text: "Great—happy to connect! Here's a booking link to grab a time that works best.", icsUrl: undefined });
    } finally {
      setLoading(false);
    }
  };

  const show = detectMeetingIntent(composerText);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={handleInsert}
      disabled={loading}
      className="rounded-2xl px-3 py-1 text-sm bg-black text-white hover:opacity-90 disabled:opacity-50"
      aria-label="Insert meeting link and invite"
    >
      {loading ? "Preparing invite…" : "Insert meeting + .ics"}
    </button>
  );
} 