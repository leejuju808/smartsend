"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";

type Message = {
  id: string;
  subject: string | null;
  body_text: string;
  direction: "inbound" | "outbound";
  created_at: string;
  from_address: string | null;
};

interface MessagesSectionProps {
  messages: Message[];
  portalToken: string;
}

export function MessagesSection({ messages, portalToken }: MessagesSectionProps) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    setSending(true);
    try {
      const response = await fetch("/api/homeowner/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: portalToken,
          message: messageText,
        }),
      });

      if (response.ok) {
        setMessageText("");
        // Refresh page to show new message
        window.location.reload();
      } else {
        const errorData = await response.json();
        alert(errorData.error || "Failed to send message. Please try again.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages List */}
        {messages.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`p-3 rounded-lg ${
                  (message.direction === "outbound" || message.direction === "outgoing")
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">
                    {(message.direction === "outbound" || message.direction === "outgoing") ? "You" : "Roofing Team"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(message.created_at).toLocaleDateString()}
                  </span>
                </div>
                {message.subject && (
                  <p className="text-sm font-semibold mb-1">{message.subject}</p>
                )}
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {message.body || message.body_text || ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No messages yet. Send a message below if you have questions!
          </p>
        )}

        {/* Send Message Form */}
        <div className="border-t pt-4 space-y-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Ask a question or send a message..."
            className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sending}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}







