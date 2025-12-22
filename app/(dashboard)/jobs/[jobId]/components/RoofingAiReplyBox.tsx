"use client";

import React, { useState } from "react";

type Props = {
  jobId: string;
};

export const RoofingAiReplyBox: React.FC<Props> = ({ jobId }) => {
  const [suggestion, setSuggestion] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/roofing/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, channel }),
      });

      if (!res.ok) {
        throw new Error("Failed to get AI reply");
      }

      const data = await res.json();
      setSuggestion(data.suggestion || "");
    } catch (err) {
      console.error(err);
      setSuggestion(
        "Hi, thanks for reaching out about your roof. When are you available this week for a quick inspection or estimate?"
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
    } catch (err) {
      console.error("Clipboard error", err);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-200">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            AI Follow-Up Suggestion
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            Let SmartSend draft a reply for this homeowner so you can respond faster
            and book the estimate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "sms")}
          >
            <option value="email">Email style</option>
            <option value="sms">Text message</option>
          </select>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          className="h-32 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="Click 'Generate reply' to get a suggestion..."
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate reply"}
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!suggestion}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Copy to clipboard
          </button>
        </div>
      </div>
    </div>
  );
};















































