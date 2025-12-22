"use client";

import * as React from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ComposerRewritePanelProps = {
  threadId: string;
  onInsert: (subject: string, body: string) => void;
};

export function ComposerRewritePanel({ threadId, onInsert }: ComposerRewritePanelProps) {
  const { data, isLoading, mutate } = useSWR(`/api/threads/${threadId}/rewrite`, fetcher, { refreshInterval: 0 });
  const rewrite = data?.rewrite ?? null;

  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState(rewrite?.subject ?? "");
  const [body, setBody] = React.useState(rewrite?.body ?? "");

  React.useEffect(() => {
    setSubject(rewrite?.subject ?? "");
    setBody(rewrite?.body ?? "");
  }, [rewrite?.subject, rewrite?.body]);

  const approveSend = async (send: boolean) => {
    await fetch(`/api/threads/${threadId}/approve-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, content: body, send }),
    });

    if (!send) {
      onInsert(subject, body);
    }

    setOpen(false);
    void mutate();
  };

  const triggerLabel = rewrite ? "AI Rewrite" : isLoading ? "Loading…" : "No Rewrite Yet";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" onClick={() => setOpen(true)} disabled={isLoading || !rewrite}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            AI Rewrite Preview
            {data?.label ? (
              <Badge variant="secondary" className="capitalize">
                {String(data.label).replaceAll("_", " ")}
              </Badge>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {!rewrite ? (
          <div className="text-sm text-muted-foreground">
            No rewrite yet. It will appear after a reply is classified (positive / question / neutral / routing / human
            reply).
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Subject</label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Body</label>
              <Textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => approveSend(false)}>
                Insert into composer
              </Button>
              <Button onClick={() => approveSend(true)}>Approve &amp; Send</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


