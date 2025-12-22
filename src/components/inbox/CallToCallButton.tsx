"use client";

import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { initiateCall, formatPhoneNumber, extractPhoneNumbers } from "@/lib/phone-utils";
import { useState, useEffect } from "react";

interface CallToCallButtonProps {
  contactPhone?: string | null;
  threadMessages?: Array<{ body_text?: string | null; body_html?: string | null }>;
  contactId?: string | null;
  threadId?: string | null;
  onCallInitiated?: () => void;
}

export function CallToCallButton({
  contactPhone,
  threadMessages = [],
  contactId,
  threadId,
  onCallInitiated,
}: CallToCallButtonProps) {
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  useEffect(() => {
    // First try contact phone
    if (contactPhone) {
      setPhoneNumber(contactPhone);
      return;
    }

    // Otherwise, extract from thread messages
    const allText = threadMessages
      .map((m) => m.body_text || m.body_html || "")
      .join(" ");

    const extracted = extractPhoneNumbers(allText);
    if (extracted.length > 0) {
      setPhoneNumber(extracted[0]);
    }
  }, [contactPhone, threadMessages]);

  const handleCall = async () => {
    if (!phoneNumber) return;

    // Log call attempt
    if (contactId && threadId) {
      try {
        await fetch("/api/inbox/call-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: contactId,
            thread_id: threadId,
            call_type: "attempted",
          }),
        });
      } catch (err) {
        console.error("Failed to log call attempt", err);
      }
    }

    // Initiate call
    initiateCall(phoneNumber);
    onCallInitiated?.();
  };

  if (!phoneNumber) {
    return null;
  }

  return (
    <Button
      onClick={handleCall}
      className="flex items-center gap-2"
      size="sm"
    >
      <Phone className="h-4 w-4" />
      Call {formatPhoneNumber(phoneNumber)}
    </Button>
  );
}



















































