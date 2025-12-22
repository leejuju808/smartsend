"use client";

import { Message } from "../page";
import { formatTimestamp } from "../utils/formatTimestamp";
import { colors } from "../constants/colors";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Determine if message is from homeowner (inbound) or owner (outbound)
  // For now, we'll assume messages in inbox_messages are inbound (from homeowner)
  const isHomeowner = true; // You might want to check direction field if available

  return (
    <div
      className={cn(
        "flex animate-in slide-in-from-left-5 duration-300",
        isHomeowner ? "justify-start" : "justify-end"
      )}
    >
      <div
        className="max-w-[80%] rounded-lg px-4 py-3 shadow-sm transition-all hover:shadow-md"
        style={{
          backgroundColor: isHomeowner ? colors.white : colors.primary,
          border: isHomeowner ? `1px solid ${colors.divider}` : "none",
        }}
      >
        <div
          className="flex items-center gap-2 mb-2 text-xs"
          style={{ color: colors.inkSecondary }}
        >
          <span>From: {message.from_email}</span>
          <span>•</span>
          <span>{formatTimestamp(message.received_at)}</span>
        </div>
        <div
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{
            color: isHomeowner ? colors.ink : colors.white,
          }}
        >
          {message.body_clean || message.body_raw || "No content"}
        </div>
      </div>
    </div>
  );
}

