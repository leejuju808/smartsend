"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type MeetingDraft = {
  id: string;
  title: string;
  duration_minutes: number;
  tz_ianna: string | null;
  windows: { start: string; end: string }[];
  location: string | null;
  conferencing: { provider?: string; url?: string; passcode?: string } | null;
  notes: string | null;
  confidence: number;
  status: string;
};

export function MeetingDraftCard({ threadId }: { threadId: string }) {
  const { data, mutate } = useSWR<{ ok: boolean; draft: MeetingDraft | null }>(
    `/api/threads/${threadId}/meeting-draft`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 4000 },
  );

  const d = data?.draft;
  if (!d || !d.windows?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting Draft</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{d.title}</Badge>
          <Badge variant="outline">{d.duration_minutes} min</Badge>
          {d.tz_ianna ? <Badge variant="outline">{d.tz_ianna}</Badge> : null}
          <span className="text-xs opacity-60">conf {(d.confidence * 100) | 0}%</span>
        </div>

        <div className="space-y-2">
          {d.windows.map((w, i) => (
            <div
              key={`${w.start}-${i}`}
              className="flex items-center justify-between rounded-lg border border-zinc-800/60 px-2 py-1"
            >
              <div className="text-xs">
                {new Date(w.start).toLocaleString()} → {new Date(w.end).toLocaleString()}
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  await fetch(`/api/threads/${threadId}/meeting-confirm`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ windowIndex: i }),
                  });
                  mutate();
                }}
              >
                Create invite
              </Button>
            </div>
          ))}
        </div>

        {d.location ? (
          <div>
            <b>Location:</b> {d.location}
          </div>
        ) : null}
        {d.conferencing?.url ? (
          <div className="truncate">
            <b>VC:</b>{" "}
            <a className="underline" href={d.conferencing.url} target="_blank" rel="noreferrer">
              {d.conferencing.url}
            </a>
          </div>
        ) : null}
        {d.notes ? <div className="opacity-80">{d.notes}</div> : null}
      </CardContent>
    </Card>
  );
}

