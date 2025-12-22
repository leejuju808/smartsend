"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";

type ClassificationRow = {
  label: string;
  confidence: number;
  via: string;
};

type ClassificationResponse = {
  ok: boolean;
  row: ClassificationRow | null;
  action: Record<string, unknown> | null;
};

export function HeaderChips({ messageId }: { messageId: string }) {
  const { data } = useSWR<ClassificationResponse>(
    () => (messageId ? `/api/messages/${messageId}/classification` : null),
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 4000 },
  );

  if (!data?.row) return null;
  const c = data.row;
  const actionHint = renderActionHint(data.action);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={mapVariant(c.label)} className="capitalize">
          {c.label.replace(/_/g, " ")}
        </Badge>
        <span className="text-xs opacity-60">conf {Math.floor(Number(c.confidence) * 100)}% via {c.via}</span>
      </div>
      {actionHint ? <span className="text-xs text-muted-foreground">{actionHint}</span> : null}
    </div>
  );
}

function mapVariant(label: string) {
  if (label === "positive" || label === "meeting_intent") return "default";
  if (label === "ooo" || label === "oos") return "secondary";
  if (label === "bounce") return "destructive";
  return "outline";
}

function renderActionHint(actions: Record<string, unknown> | null) {
  if (!actions) return null;
  const data = actions as Record<string, any>;
  if (data.pause_ooo) return "Paused (OOO)";
  if (typeof data.set_preset === "string") {
    return `Preset: ${data.set_preset}`;
  }
  if (data.meeting_draft) return "Meeting draft prepared";
  if (data.meeting_followup) return "Meeting follow-up";
  return null;
}
