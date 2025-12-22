"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SmartFollowupPreview({
  threadId,
  campaignId,
  leadId,
  fromAccountId,
}: {
  threadId: string;
  campaignId: string;
  leadId: string;
  fromAccountId?: string;
}) {
  const { data, isLoading, mutate } = useSWR(
    `/api/thread/${threadId}/last-draft`,
    fetcher,
    {
      refreshInterval: 5000,
    }
  );

  const draft = data?.draft;

  const onSendNow = React.useCallback(async () => {
    const res = await fetch("/api/send-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "last-draft",
        thread_id: threadId,
        campaign_id: campaignId,
        lead_id: leadId,
        from_account_id: fromAccountId,
        provider: "gmail",
        step_no: 1,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(`Send failed: ${json?.error ?? res.statusText}`);
      return;
    }

    toast.success("Sent");
    void mutate();
    try {
      (window as any)?.mutateThread?.();
    } catch (error) {
      console.debug("SmartFollowupPreview mutateThread noop", error);
    }
    try {
      (window as any)?.mutateMessages?.();
    } catch (error) {
      console.debug("SmartFollowupPreview mutateMessages noop", error);
    }
  }, [campaignId, fromAccountId, leadId, mutate, threadId]);

  if (isLoading || !draft) {
    return null;
  }

  return (
    <Card className="border border-zinc-800">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Latest AI Draft</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-2 py-3">
        <div className="text-sm">
          <span className="font-medium">Subject:</span> {draft.subject || "Re:"}
        </div>
        <pre className="whitespace-pre-wrap text-sm">{draft.body}</pre>
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={onSendNow}>
            Send Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



