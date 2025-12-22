// Block 13300 — iMessage-style Message Bubble Component

"use client";

import { cleanHtmlEmail } from "@/lib/inbox/html-cleaner";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type MessageBubbleProps = {
  message: {
    id: string;
    direction: "in" | "out";
    body_html?: string | null;
    body_text?: string | null;
    sent_at: string;
    delivered_at?: string | null;
    read_at?: string | null;
    has_quoted_text?: boolean;
  };
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const [showQuoted, setShowQuoted] = useState(false);

  const isInbound = message.direction === "in";
  const isOutbound = message.direction === "out";

  // Clean HTML if available
  const htmlContent = message.body_html
    ? cleanHtmlEmail(message.body_html).cleaned
    : null;

  const textContent = message.body_text || "";

  // Format timestamp
  const sentDate = new Date(message.sent_at);
  const timeStr = sentDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Determine bubble styling
  const bubbleClasses = isInbound
    ? "bg-gray-100 text-gray-900 ml-0 mr-auto" // Homeowner = grey
    : isOutbound
    ? "bg-blue-500 text-white ml-auto mr-0" // Roofer = blue
    : "bg-gray-200 text-gray-700 ml-auto mr-0"; // SmartSend automated = light

  return (
    <div
      className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-4`}
    >
      <div className={`max-w-[75%] ${isInbound ? "items-start" : "items-end"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2 ${bubbleClasses} shadow-sm`}
          style={{
            borderRadius: isInbound ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
          }}
        >
          {htmlContent ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
              style={{
                color: isOutbound ? "white" : "inherit",
              }}
            />
          ) : (
            <div className="whitespace-pre-wrap">{textContent}</div>
          )}

          {message.has_quoted_text && (
            <div className="mt-2 pt-2 border-t border-gray-300">
              <button
                onClick={() => setShowQuoted(!showQuoted)}
                className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
              >
                {showQuoted ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide quoted text
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show quoted text
                  </>
                )}
              </button>
              {showQuoted && (
                <div className="mt-1 text-xs opacity-60 italic">
                  {/* Quoted text would go here */}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`text-xs text-gray-500 mt-1 ${isInbound ? "ml-0" : "mr-0"} flex items-center gap-2`}>
          <span>{timeStr}</span>
          {isOutbound && (
            <>
              {message.delivered_at && (
                <span className="text-green-600">✓</span>
              )}
              {message.read_at && (
                <span className="text-blue-600">✓✓</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}





















































