"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";

type Bounce = {
  smtp_code?: string | null;
  reason_key: string;
  reason_label: string;
  action_key: string | null;
  raw_excerpt: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BounceBanner({ messageId }: { messageId: string }) {
  const { data } = useSWR<{ ok: boolean; bounce: Bounce | null }>(
    messageId ? `/api/messages/${messageId}/bounce` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const bounce = data?.bounce;
  if (!bounce) return null;

  return (
    <div className="border border-red-800/40 bg-red-950/40 rounded-lg p-3 text-sm text-red-50 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Bounce</Badge>
        <span>
          {bounce.reason_label}
          {bounce.smtp_code ? ` (${bounce.smtp_code})` : ""}
        </span>
        {bounce.action_key && (
          <span className="text-xs opacity-80">
            action: <code>{bounce.action_key}</code>
          </span>
        )}
      </div>
      {bounce.raw_excerpt && (
        <div className="text-xs opacity-75 mt-1 truncate">{bounce.raw_excerpt}</div>
      )}
    </div>
  );
}

