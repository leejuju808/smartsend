// Block 22073 — SmartSend Roofing Job Save Engine v1
// AI Recovery Message Modal Component
// Shows AI-generated recovery message with one-click send or edit options

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Edit2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface JobSaveEvent {
  id: string;
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string | null;
  recovery_message_draft: string | null;
}

interface JobSaveRecoveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveEvent: JobSaveEvent;
  leadId: string;
}

export function JobSaveRecoveryModal({
  open,
  onOpenChange,
  saveEvent,
  leadId,
}: JobSaveRecoveryModalProps) {
  const [message, setMessage] = useState(saveEvent.recovery_message_draft || "");
  const [isEditing, setIsEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Message cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      // TODO: Implement actual send logic via API
      const res = await fetch(`/api/job-save/send-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          event_id: saveEvent.id,
          message,
        }),
      });

      if (res.ok) {
        toast({
          title: "Recovery message sent",
          description: "Your message has been sent to the homeowner.",
        });
        onOpenChange(false);
        
        // Mark event as resolved
        await fetch(`/api/job-save/events/${saveEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        });
      } else {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending recovery message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-red-600">⚠️</span>
            Job Recovery Plan
          </DialogTitle>
          <DialogDescription>
            SmartSend detected this job is at risk. Review the AI-generated recovery message below
            and send it to re-engage the homeowner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Recovery Message {isEditing && "(Editing)"}
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!isEditing}
              className="min-h-[150px] font-sans"
              placeholder="Recovery message will appear here..."
            />
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Message
              </Button>
            )}
          </div>

          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs font-medium mb-1">Why this job needs attention:</p>
            <p className="text-xs text-muted-foreground">
              {saveEvent.reason || "Job health and momentum have declined."}
            </p>
            <p className="text-xs font-medium mt-2 mb-1">Severity:</p>
            <p className="text-xs text-muted-foreground capitalize">{saveEvent.severity}</p>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {isEditing ? (
              <Button onClick={() => setIsEditing(false)}>Save Changes</Button>
            ) : (
              <Button onClick={handleSend} disabled={sending}>
                <Send className="h-4 w-4 mr-2" />
                {sending ? "Sending..." : "Send Recovery Message"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

