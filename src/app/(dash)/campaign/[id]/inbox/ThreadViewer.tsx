import * as React from "react";
import { Button } from "@/components/ui/button";
import { NudgeBanner } from "@/components/thread/NudgeBanner";
import { toast } from "sonner";

type ThreadViewerProps = {
  threadId: string;
  onUpdated?: () => void;
};

const LABEL_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "human_reply", label: "Human Reply" },
  { value: "question", label: "Question" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "routing", label: "Routing" },
  { value: "ooh", label: "OOO" },
  { value: "bounce", label: "Bounce" },
  { value: "unsubscribe", label: "Unsubscribe" },
];

export function ThreadViewer({ threadId, onUpdated }: ThreadViewerProps) {
  const [messages, setMessages] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/thread/${threadId}/messages`);
    const json = await res.json().catch(() => ({}));
    setMessages(json.messages ?? []);
    setLoading(false);
  }, [threadId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const markNeeds = React.useCallback(
    async (needs: boolean) => {
      await fetch(`/api/thread/${threadId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ needs_reply: needs }),
      });
      onUpdated?.();
    },
    [onUpdated, threadId]
  );

  const setLabel = React.useCallback(
    async (messageId: string, label: string) => {
      await fetch(`/api/thread/${threadId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message_id: messageId, ai_label: label }),
      });
      await load();
      onUpdated?.();
    },
    [load, onUpdated, threadId]
  );

  const relabel = React.useCallback(async () => {
    const res = await fetch(`/api/thread/${threadId}/relabel`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Labeled: ${json.label}`);
      await load();
      onUpdated?.();
    } else {
      toast.error(json?.error ?? "Relabel failed");
    }
  }, [load, onUpdated, threadId]);

  return (
    <div className="flex h-full flex-col gap-3">
      <NudgeBanner threadId={threadId} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => markNeeds(true)}>
          Mark Needs Reply
        </Button>
        <Button size="sm" variant="outline" onClick={() => markNeeds(false)}>
          Mark Replied
        </Button>
        <Button size="sm" variant="secondary" onClick={relabel}>
          Re-run Detection
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {loading ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">No messages.</div>
        ) : (
          <ul className="divide-y">
            {messages.map((message) => (
              <li key={message.id} className="p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm">
                    <b>{message.direction === "inbound" ? "From" : "To"}</b>{" "}
                    <span className="text-muted-foreground">
                      {message.direction === "inbound" ? message.from_email : message.to_email}
                    </span>{" "}
                    • <span className="text-muted-foreground">{new Date(message.sent_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Label:</span>
                    <select
                      className="rounded border bg-background p-1 text-xs"
                      value={message.ai_label ?? ""}
                      onChange={(event) => setLabel(message.id, event.target.value)}
                    >
                      {LABEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {message.subject && <div className="mb-1 text-sm font-medium">{message.subject}</div>}
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: message.html ?? message.preview_clean ?? "" }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


