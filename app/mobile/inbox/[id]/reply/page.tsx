"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Quick Reply Screen
 * Pre-filled message from AI suggestions
 */
export default function MobileReplyPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const leadId = params.id as string;
  const prefillMessage = searchParams.get("message") || "";

  const [message, setMessage] = useState(prefillMessage);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      alert("Please enter a message");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/mobile/inbox/${leadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to send reply");
        return;
      }

      alert("Reply sent!");
      router.back();
    } catch (error) {
      console.error("Error sending reply:", error);
      alert("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Quick Reply</h1>
            <p className="text-xs text-gray-600">Send a message</p>
          </div>
        </div>
      </div>

      {/* Message Input */}
      <div className="flex-1 p-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your reply..."
          className="w-full h-full bg-white border rounded-lg p-4 text-gray-900 resize-none"
          autoFocus
        />
      </div>

      {/* Send Button */}
      <div className="bg-white border-t p-4">
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-full bg-blue-500 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300"
        >
          {sending ? (
            "Sending..."
          ) : (
            <>
              <Send className="h-5 w-5" />
              Send Reply
            </>
          )}
        </button>
      </div>
    </div>
  );
}






































