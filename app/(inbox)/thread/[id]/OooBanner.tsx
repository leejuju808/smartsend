"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ThreadStateResponse = {
  ok: boolean;
  thread?: { id: string; paused_until: string | null };
  preset?: string | null;
};

export function OooBanner({ threadId }: { threadId: string }) {
  const { data, mutate } = useSWR<ThreadStateResponse>(
    `/api/threads/${threadId}/state`,
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 5000 }
  );

  const thread = data?.thread;
  if (!thread?.paused_until) return null;

  const dt = new Date(thread.paused_until);

  return (
    <div className="flex items-center justify-between border border-yellow-600/40 rounded-lg px-3 py-2 bg-yellow-500/10">
      <div className="text-sm">
        <Badge variant="secondary">OOO</Badge>{" "}
        Paused until <b>{dt.toLocaleString()}</b> — preset{" "}
        <code>{data?.preset || "ooo_reentry"}</code>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await fetch(`/api/threads/${threadId}/resume-now`, { method: "POST" });
            mutate();
          }}
        >
          Resume now
        </Button>
      </div>
    </div>
  );
}

