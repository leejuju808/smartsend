// app/dashboard/replies/_components/ActivityRow.tsx
"use client";

import { formatDistanceToNow } from "date-fns";

type IntentType = "hot" | "warm" | "not_interested";

type ActivityRowType = {
  id: string;
  reply_id: string;
  intent: IntentType | null;
  confidence: number | null;
  model_version: string | null;
  classified_at: string | null;
  intent_source: "ai" | "manual";
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
};

interface Props {
  activity: ActivityRowType;
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

function intentChip(intent: IntentType | null) {
  if (!intent) {
    return (
      <span className="rounded-full border border-blue-600 bg-blue-500/10 px-2 py-[2px] text-[10px] font-medium text-blue-600">
        Unclassified
      </span>
    );
  }

  const cfgMap: Record<
    IntentType,
    { label: string; cls: string }
  > = {
    hot: {
      label: "Hot",
      cls: "border-red-600 bg-red-500/10 text-red-600",
    },
    warm: {
      label: "Warm",
      cls: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
    },
    not_interested: {
      label: "Not Interested",
      cls: "border-gray-600 bg-gray-500/10 text-gray-400",
    },
  };

  const cfg = cfgMap[intent];

  return (
    <span
      className={`rounded-full border px-2 py-[2px] text-[10px] font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function sourceChip(source: "ai" | "manual", modelVersion: string | null) {
  if (source === "manual") {
    return (
      <span className="rounded-full border border-emerald-600 bg-emerald-500/10 px-2 py-[2px] text-[10px] font-medium text-emerald-600">
        Manual override
      </span>
    );
  }

  // ai
  return (
    <span className="rounded-full border border-indigo-600 bg-indigo-500/10 px-2 py-[2px] text-[10px] font-medium text-indigo-600">
      AI{modelVersion ? ` · ${modelVersion}` : ""}
    </span>
  );
}

export default function ActivityRow({ activity }: Props) {
  const nameOrEmail =
    activity.from_name || activity.from_email || "Unknown sender";

  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-background px-3 py-2 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium leading-tight">
              {nameOrEmail}
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {activity.from_email}
            </span>
          </div>
          {activity.subject && (
            <p className="text-xs font-medium text-foreground">
              {activity.subject}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {intentChip(activity.intent)}
            {sourceChip(activity.intent_source, activity.model_version)}
          </div>
          <span className="text-[10px] text-muted-foreground">
            Labeled {formatTimeAgo(activity.classified_at)}
          </span>
        </div>
      </div>

      {activity.preview && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {activity.preview}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>Confidence {formatConfidence(activity.confidence)}</span>
        <span>
          Reply received {formatTimeAgo(activity.received_at)} · Reply{" "}
          {activity.reply_id.slice(0, 8)}…
        </span>
      </div>
    </article>
  );
}


























































