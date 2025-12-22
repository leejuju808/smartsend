"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ThreadIntelCard({ threadId }: { threadId: string }) {
  const { data, mutate } = useSWR(
    `/api/threads/${threadId}/insights`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 5000 },
  );

  if (!data?.insight) return null;
  const i = data.insight;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Thread Intelligence</span>
          <span className="text-xs opacity-60">conf: {(Number(i.confidence ?? 0) * 100) | 0}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="prose prose-invert text-sm">
          {i.summary?.split("\n").map((l: string, idx: number) => (
            <div key={idx}>• {l}</div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">stance: {i.stance ?? "—"}</Badge>
          <Badge
            variant={i.sentiment > 0 ? "default" : i.sentiment < 0 ? "destructive" : "secondary"}
          >
            sentiment: {i.sentiment ?? 0}
          </Badge>
          {(data.objections || []).map((o: any) => (
            <Badge key={o.tag_key} variant="outline">
              {o.tag_key}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={async () => {
              const r = await fetch(`/api/threads/${threadId}/apply-nba`, { method: "POST" });
              if (r.ok) mutate();
            }}
          >
            {renderNba(i.nba_key)}
          </Button>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function renderNba(key?: string) {
  switch (key) {
    case "book_meeting":
      return "Book meeting";
    case "send_case_study":
      return "Send case study";
    case "route_alt":
      return "Find the right person";
    case "pause_ooo":
      return "Pause until back";
    case "verify_email":
      return "Verify email";
    case "handoff_ae":
      return "Handoff to AE";
    case "stop_sequence":
      return "Stop sequence";
    default:
      return "Clarify";
  }
}

