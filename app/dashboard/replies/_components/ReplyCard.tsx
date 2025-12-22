// app/dashboard/replies/_components/ReplyCard.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

type IntentType = "hot" | "warm" | "not_interested" | "unclassified";

interface ReplyRow {
  id: string;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: IntentType | null;
  confidence: number | null;
  model_version: string | null;
  classified_at: string | null;
  intent_source: "ai" | "manual" | null;
}

interface ReplyCardProps {
  reply: ReplyRow;
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return "—";
  const pct = Math.round(confidence * 100);
  return `${pct}%`;
}

function formatIntentSource(
  source: "ai" | "manual" | null,
  modelVersion: string | null
): string {
  if (!source) return "Unclassified";
  if (source === "manual") return "Manual override";
  // ai
  if (modelVersion) return `AI · ${modelVersion}`;
  return "AI classified";
}

function formatIntentUpdated(classifiedAt: string | null): string {
  if (!classifiedAt) return "—";
  try {
    return formatDistanceToNow(new Date(classifiedAt), { addSuffix: true });
  } catch {
    return classifiedAt;
  }
}

function intentBadge(intent: IntentType | null) {
  if (!intent || intent === "unclassified") {
    return (
      <span className="rounded-full border border-blue-600 bg-blue-500/10 px-2 py-[2px] text-[10px] font-medium text-blue-600">
        Unclassified
      </span>
    );
  }

  const map: Record<
    Exclude<IntentType, "unclassified">,
    { label: string; cls: string }
  > = {
    hot: {
      label: "Hot Lead",
      cls: "border-red-600 bg-red-500/10 text-red-600",
    },
    warm: {
      label: "Warm Lead",
      cls: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
    },
    not_interested: {
      label: "Not Interested",
      cls: "border-gray-600 bg-gray-500/10 text-gray-400",
    },
  };

  const cfg = map[intent as Exclude<IntentType, "unclassified">];

  return (
    <span
      className={`rounded-full border px-2 py-[2px] text-[10px] font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export default function ReplyCard({ reply }: ReplyCardProps) {
  const nameOrEmail = reply.from_name || reply.from_email || "Unknown sender";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreatingLead, startCreateLeadTransition] = useTransition();

  async function updateIntent(intent: IntentType) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/replies/intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            replyId: reply.id,
            intent,
          }),
        });

        if (!res.ok) {
          console.error("Failed to update intent", await res.text());
          return;
        }

        // Refresh the replies page so pills + cards update
        router.refresh();
      } catch (err) {
        console.error("Error updating intent", err);
      }
    });
  }

  // NEW: create lead from reply
  async function createLeadFromReply() {
    startCreateLeadTransition(async () => {
      try {
        const res = await fetch("/api/leads/from-reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ replyId: reply.id }),
        });

        if (!res.ok) {
          console.error("Failed to create lead", await res.text());
          return;
        }

        const json = await res.json();
        // If you add a /dashboard/leads/[id] page later, you can push there:
        // router.push(`/dashboard/leads/${json.leadId}`);
        router.refresh();
      } catch (err) {
        console.error("Error creating lead from reply", err);
      }
    });
  }

  const currentIntent: IntentType =
    reply.intent ?? ("unclassified" as IntentType);

  const intentButtonBase =
    "rounded-full border px-2 py-[2px] text-[10px] font-medium transition hover:-translate-y-[0.5px] hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

  const btnStyles: Record<IntentType, string> = {
    hot: "border-red-600 text-red-600 bg-red-500/5",
    warm: "border-yellow-500 text-yellow-600 bg-yellow-500/5",
    not_interested: "border-gray-600 text-gray-400 bg-gray-500/5",
    unclassified: "border-blue-600 text-blue-600 bg-blue-500/5",
  };

  return (
    <article className="group rounded-xl border bg-background px-3 py-2 text-sm shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium leading-tight">{nameOrEmail}</h3>
            <span className="text-[10px] text-muted-foreground">
              {reply.from_email}
            </span>
          </div>
          {reply.subject && (
            <p className="text-xs font-medium text-foreground">
              {reply.subject}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {intentBadge(currentIntent)}
          <span className="text-[10px] text-muted-foreground">
            {formatTimeAgo(reply.received_at)}
          </span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {reply.preview || "No preview available for this reply."}
      </p>

      {/* Activity line: where label came from + when */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {formatIntentSource(reply.intent_source, reply.model_version)} ·{" "}
          Confidence {formatConfidence(reply.confidence)}
        </span>
        <span className="text-[10px]">
          Updated {formatIntentUpdated(reply.classified_at)}
        </span>
      </div>

      {/* Manual intent override row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span className="text-[10px] text-muted-foreground">
          Set intent:
        </span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateIntent("hot")}
            className={`${intentButtonBase} ${btnStyles.hot} ${
              currentIntent === "hot"
                ? "ring-1 ring-red-600 bg-red-500/10"
                : ""
            }`}
          >
            Hot
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateIntent("warm")}
            className={`${intentButtonBase} ${btnStyles.warm} ${
              currentIntent === "warm"
                ? "ring-1 ring-yellow-500 bg-yellow-500/10"
                : ""
            }`}
          >
            Warm
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateIntent("not_interested")}
            className={`${intentButtonBase} ${btnStyles.not_interested} ${
              currentIntent === "not_interested"
                ? "ring-1 ring-gray-500 bg-gray-500/10"
                : ""
            }`}
          >
            Not interested
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateIntent("unclassified")}
            className={`${intentButtonBase} ${btnStyles.unclassified} ${
              currentIntent === "unclassified"
                ? "ring-1 ring-blue-600 bg-blue-500/10"
                : ""
            }`}
          >
            Re-run AI
          </button>
        </div>
      </div>

      {/* NEW: Create Lead CTA */}
      <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
        <span className="text-[10px] text-muted-foreground">
          Turn this reply into a tracked lead.
        </span>
        <button
          type="button"
          disabled={isCreatingLead}
          onClick={createLeadFromReply}
          className="rounded-full border border-emerald-600 bg-emerald-500/10 px-3 py-[4px] text-[11px] font-medium text-emerald-700 transition hover:-translate-y-[0.5px] hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreatingLead ? "Creating…" : "Create Lead"}
        </button>
      </div>
    </article>
  );
}

