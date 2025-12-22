"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { useReplyModal } from "./useReplyModal";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTransition } from "react";

export default function ReplyPreviewModal() {
  const { open, lead, close } = useReplyModal();
  const supabase = createClientComponentClient();
  const [pending, start] = useTransition();

  const markRead = () => {
    if (!lead) return;
    start(async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("lead_id", lead.id);
      close();
    });
  };

  const openThread = () => {
    if (!lead?.thread_id) {
      // Navigate to inbox page if no specific thread
      window.location.href = `/dashboard/inbox`;
      return;
    }
    // route to inbox thread page if you have one
    window.location.href = `/dashboard/inbox`;
  };

  const quickReply = async (template: string) => {
    if (!lead) return;
    try {
      await fetch("/api/send-quick-reply", {
        method: "POST",
        body: JSON.stringify({
          leadId: lead.id,
          campaignId: lead.campaign_id,
          threadId: lead.thread_id,
          template,
        }),
        headers: { "Content-Type": "application/json" },
      });
      markRead();
    } catch (error) {
      console.error("Error sending quick reply:", error);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply from {lead.lead_name ?? lead.lead_email ?? "Lead"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {lead.replied_at ? new Date(lead.replied_at).toLocaleString() : ""}
          </p>
        </DialogHeader>

        <div className="rounded-xl border p-4 max-h-64 overflow-auto whitespace-pre-wrap">
          {lead.reply_text ?? "—"}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button 
            variant="secondary" 
            onClick={() => quickReply("Great to hear from you! When's a good time for a quick call?")}
          >
            Quick: Book a Call
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => quickReply("Thanks! Can you share your current volume and toolstack?")}
          >
            Qualify
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => quickReply("Awesome—here's a 7-day trial link. I'll set you up today.")}
          >
            Trial Link
          </Button>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={markRead} disabled={pending}>Mark read</Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={openThread}>Open inbox</Button>
            <Button onClick={() => quickReply("Thanks for the reply! Looping in details now.")}>Reply</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

