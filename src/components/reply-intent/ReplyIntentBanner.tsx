"use client";

import * as React from "react";
import { useState } from "react";

type Props = {
  messageId: string;
  senderEmail: string;
  bodyText: string;
  senderName?: string;
};

export default function ReplyIntentBanner({
  messageId,
  senderEmail,
  bodyText,
  senderName,
}: Props) {
  const [status, setStatus] = useState<"idle" | "detecting" | "found" | "none" | "sending" | "sent" | "error">("idle");
  const [calUrl, setCalUrl] = useState<string | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function detectIntent() {
    try {
      setStatus("detecting");
      const res = await fetch("/api/reply-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: messageId,
          sender_email: senderEmail,
          body_text: bodyText,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setStatus("found");
        setCalUrl(data.calendly_url || null);
        // Optionally we could get meeting row back; for now try to read it
        // If your /api/reply-intent returns the inserted meeting id, set it here.
        setMeetingId(data.meeting_id || null);
      } else {
        setStatus("none");
      }
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  }

  async function sendInvite() {
    try {
      setStatus("sending");
      const res = await fetch("/api/reply-intent/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: meetingId,
          message_id: messageId,
          to_email: senderEmail,
          to_name: senderName,
          calendly_url: calUrl ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("sent");
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  }

  React.useEffect(() => {
    detectIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "idle" || status === "detecting") {
    return (
      <div className="rounded-2xl border p-4 bg-muted/30 text-sm">
        Detecting meeting intent…
      </div>
    );
  }

  if (status === "none") return null;

  if (status === "error") {
    return (
      <div className="rounded-2xl border p-4 bg-red-50 text-red-700 text-sm">
        Failed to detect/send invite{error ? `: ${error}` : ""}.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4 bg-emerald-50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-emerald-800 font-semibold">Meeting intent detected</div>
          <div className="text-emerald-900/80 text-sm">
            {calUrl ? (
              <>
                Calendly:{" "}
                <a className="underline" href={calUrl} target="_blank" rel="noreferrer">
                  {calUrl}
                </a>
              </>
            ) : (
              "A default Calendly link will be used."
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status !== "sent" ? (
            <button
              onClick={sendInvite}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending…" : "Send Invite"}
            </button>
          ) : (
            <span className="text-emerald-700 font-medium">Invite sent ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
