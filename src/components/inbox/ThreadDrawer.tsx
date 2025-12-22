"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ThreadDrawer() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string>("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    function onOpen(e: any) { 
      setThreadId(e.detail.threadId); 
      setOpen(true); 
    }
    window.addEventListener("openThread", onOpen as any);
    return () => window.removeEventListener("openThread", onOpen as any);
  }, []);

  useEffect(() => {
    if (!open || !threadId) return;
    (async () => {
      const r = await fetch(`/api/thread/${threadId}`);
      setData(await r.json());
    })();
  }, [open, threadId]);

  const quiet = data?.quiet_hours;
  const quietActive = quiet?.active;
  const nextAllowed = quiet?.next_allowed_at ? new Date(quiet.next_allowed_at) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle>
                <span className="block truncate">
                  {data?.thread?.subject || "Conversation"}
                </span>
              </SheetTitle>
            </div>
            {quietActive && (
              <Badge
                variant="secondary"
                title={
                  nextAllowed
                    ? `Next send allowed at ${nextAllowed.toLocaleString()}`
                    : undefined
                }
              >
                Quiet Hours ON
              </Badge>
            )}
          </div>
        </SheetHeader>
        <div className="space-y-3 pt-4">
          <div className="space-y-2 max-h-[70vh] overflow-auto pr-2">
            {(data?.messages ?? []).map((m: any) => (
              <div 
                key={m.id} 
                className={`rounded-2xl p-3 text-sm border ${
                  m.direction === 'inbound' ? 'bg-muted' : 'bg-background'
                }`}
              >
                <div className="opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                {m.ai_label && (
                  <div className="text-xs opacity-70">
                    AI: {m.ai_label} {m.ai_confidence ? `(${(m.ai_confidence * 100).toFixed(0)}%)` : ""}
                  </div>
                )}
                <div 
                  className="prose prose-sm max-w-none" 
                  dangerouslySetInnerHTML={{ __html: m.body_html || "" }} 
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={() => window.dispatchEvent(new CustomEvent("openQuickReply", { detail: { threadId } }))}>
              Quick Reply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
