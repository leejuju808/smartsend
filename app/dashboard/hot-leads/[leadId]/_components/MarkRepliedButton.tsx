// app/dashboard/hot-leads/[leadId]/_components/MarkRepliedButton.tsx
// Block 97000 — Mark as Replied Button Component

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function MarkRepliedButton({
  leadId,
  messageId,
}: {
  leadId: string;
  messageId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleMarkReplied = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/hot-leads/mark-replied", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          message_id: messageId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark as replied");
      }

      const data = await response.json();
      toast.success(
        `Marked as replied! Response time: ${Math.round((data.response_time_seconds || 0) / 60)} minutes`
      );
      
      // Redirect back to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (error: any) {
      console.error("Error marking as replied:", error);
      toast.error(error.message || "Failed to mark as replied");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleMarkReplied}
      disabled={loading}
      variant="default"
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Check className="w-4 h-4" />
          Mark Replied
        </>
      )}
    </Button>
  );
}


























