// Block 20200 — Call Log Card

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";

interface CallLogCardProps {
  conversationId: string;
  initialCallCount?: number | null;
  initialLastCallOutcome?: string | null;
  initialLastCallAt?: string | null;
  onUpdated?: (patch: any) => void;
}

export function CallLogCard({
  conversationId,
  initialCallCount,
  initialLastCallOutcome,
  initialLastCallAt,
  onUpdated,
}: CallLogCardProps) {
  const [outcome, setOutcome] = useState<string>("answered");
  const [note, setNote] = useState("");
  const [followUpOption, setFollowUpOption] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  const lastSummary = (() => {
    if (!initialLastCallAt && !initialLastCallOutcome) return null;

    const label =
      initialLastCallOutcome === "answered"
        ? "Answered"
        : initialLastCallOutcome === "left_vm"
        ? "Left voicemail"
        : initialLastCallOutcome === "no_answer"
        ? "No answer"
        : initialLastCallOutcome === "wrong_number"
        ? "Wrong number"
        : initialLastCallOutcome || "Last call";

    const when = initialLastCallAt
      ? new Date(initialLastCallAt).toLocaleString()
      : "";

    return `${label} · ${when}`;
  })();

  function followUpDaysFromOption(opt: string): number | null {
    switch (opt) {
      case "tomorrow":
        return 1;
      case "three_days":
        return 3;
      case "next_week":
        return 7;
      default:
        return null;
    }
  }

  async function handleSave() {
    setSaving(true);
    const days = followUpDaysFromOption(followUpOption);

    try {
      const res = await fetch("/api/inbox/call-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          outcome,
          note: note || null,
          schedule_follow_up_days: days,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to log call");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
        setNote("");
        setOutcome("answered");
        setFollowUpOption("none");
      }
    } catch (error) {
      console.error("Failed to log call:", error);
      setSaving(false);
      alert("Failed to log call. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Call log</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Track phone call outcomes</p>
            </div>
          </div>
          {saving && (
            <span className="text-[10px] text-gray-400">Saving…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {typeof initialCallCount === "number" && initialCallCount > 0 && (
          <p className="text-[11px] text-gray-500">
            Calls logged:{" "}
            <span className="font-semibold">{initialCallCount}</span>
            {lastSummary && (
              <>
                {" "}
                · <span className="text-gray-400">{lastSummary}</span>
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Outcome
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white text-xs"
            >
              <option value="answered">Answered</option>
              <option value="left_vm">Left voicemail</option>
              <option value="no_answer">No answer</option>
              <option value="wrong_number">Wrong number</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-2 py-1 text-[11px] resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="What did they say, any decisions, objections, details?"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Schedule follow-up
            </label>
            <select
              value={followUpOption}
              onChange={(e) => setFollowUpOption(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white text-xs"
            >
              <option value="none">No follow-up</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="three_days">In 3 days</option>
              <option value="next_week">In 7 days</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="px-3 py-1 rounded-full bg-black text-white text-xs disabled:opacity-50"
          >
            {saving ? "Logging…" : "Log call"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

















































