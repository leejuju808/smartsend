"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import ReplyComposer from "./ReplyComposer";
import { isSalesModeEnabled } from "@/lib/feature-flags";

export type ReplyItem = {
  id: string;
  thread_id?: string | null;
  subject: string | null;
  from_email: string | null;
  to_email?: string | null;
  preview_text?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ReplyItem | null;
};

export default function ReplyDrawer({ open, onOpenChange, item }: Props) {
  const [loading, setLoading] = useState(false);
  const [fullBody, setFullBody] = useState<string | null>(null);

  useEffect(() => {
    // If you store only preview in the inbox list, fetch full body here.
    setFullBody(item?.body_html || item?.body_text || null);
  }, [item?.id]);

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            <span className="text-base md:text-lg">{item.subject || "(no subject)"}</span>
          </SheetTitle>
          <div className="text-sm text-muted-foreground">
            From: {item.from_email} • {new Date(item.created_at).toLocaleString()}
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border p-4 bg-card">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Message</div>
            {fullBody ? (
              <div
                className="prose prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizeBasic(fullBody) }}
              />
            ) : (
              <div className="text-sm text-muted-foreground">No content.</div>
            )}
          </div>

          <div className="rounded-2xl border p-4 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Reply</div>
              <div className="flex items-center gap-2">
                {!isSalesModeEnabled() ? (
                  <Button variant="secondary" size="sm" onClick={() => alert("Smart Rewrite is not available here.")}>
                    Smart Rewrite
                  </Button>
                ) : null}
              </div>
            </div>
            <ReplyComposer
              threadId={item.thread_id || undefined}
              toEmail={item.from_email || ""}
              subject={replySubject(item.subject)}
              onSent={() => onOpenChange(false)}
              onSending={setLoading}
              disabled={loading}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Minimal sanitizer for demo (replace with a proper sanitizer like DOMPurify if needed)
function sanitizeBasic(html: string) {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function replySubject(subject: string | null) {
  if (!subject) return "Re: (no subject)";
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}
