"use client";

import * as React from "react";
import useSWR from "swr";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AssignNormalized } from "./AssignNormalized";

type UnlinkedMessage = {
  id: string;
  from_email: string | null;
  subject: string | null;
  body_preview: string | null;
  sent_at: string | null;
  provider: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCampaignId?: string;
};

export function UnlinkedDrawer({ open, onOpenChange, defaultCampaignId }: Props) {
  const { data, isLoading, mutate } = useSWR<{ messages: UnlinkedMessage[] }>(
    open ? "/api/normalized/unlinked" : null,
    fetcher,
    { refreshInterval: open ? 30_000 : 0 }
  );

  const messages = data?.messages ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col" side="right">
        <SheetHeader>
          <SheetTitle>Unlinked Messages</SheetTitle>
        </SheetHeader>
        <div className="flex items-center justify-between px-6 pb-4">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${messages.length} pending`}
          </p>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Refresh
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 px-6 pb-6">
          {!messages.length && !isLoading && (
            <p className="text-sm text-muted-foreground">All caught up.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">
                    {m.from_email || "(unknown sender)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}
                  </div>
                </div>
                {m.provider && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                    {m.provider}
                  </span>
                )}
              </div>
              {m.subject && <div className="text-sm font-semibold">{m.subject}</div>}
              {m.body_preview && (
                <p className="text-sm text-muted-foreground line-clamp-3">{m.body_preview}</p>
              )}
              <AssignNormalized
                nmId={m.id}
                defaultCampaignId={defaultCampaignId}
                onAssigned={() => mutate()}
              />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

