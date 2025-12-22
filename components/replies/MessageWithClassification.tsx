"use client";

import { ReplyClassificationTag } from "./ReplyClassificationTag";

interface Message {
  id: string;
  direction: "inbound" | "outbound" | "in" | "out" | "incoming" | "outgoing";
  subject?: string | null;
  body_text?: string | null;
  created_at: string;
  intent?: string | null;
  reply_summary?: string | null;
  reply_next_action?: string | null;
  ai_confidence?: number | null;
}

interface MessageWithClassificationProps {
  message: Message;
}

/**
 * Example component showing how to display a message with classification tag
 * Use this as a reference for integrating Reply AI classification into message lists
 */
export function MessageWithClassification({ message }: MessageWithClassificationProps) {
  const isInbound = ["inbound", "in", "incoming"].includes(message.direction);

  return (
    <div className={isInbound ? "text-left" : "text-right"}>
      <div
        className={`inline-block rounded-2xl px-3 py-2 text-sm max-w-[80%] ${
          isInbound
            ? "bg-muted"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {message.subject && (
          <div className="font-medium mb-1">{message.subject}</div>
        )}
        
        {/* Show classification tag for inbound messages */}
        {isInbound && message.intent && (
          <div className="mb-2">
            <ReplyClassificationTag
              intent={message.intent as any}
              summary={message.reply_summary}
              next_action={message.reply_next_action as any}
              confidence={message.ai_confidence}
              showSummary={false}
              showAction={true}
            />
          </div>
        )}
        
        <div className="whitespace-pre-wrap">{message.body_text || "—"}</div>
      </div>
      
      <div className="text-[11px] text-muted-foreground mt-1">
        {new Date(message.created_at).toLocaleString()}
      </div>
    </div>
  );
}
























































