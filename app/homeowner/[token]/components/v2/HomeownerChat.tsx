"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Homeowner Chat Component (Ask a Question)

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Message {
  id: string;
  sender: "homeowner" | "office";
  message: string;
  created_at: string;
}

interface HomeownerChatProps {
  token: string;
  initialMessages?: Message[];
}

export function HomeownerChat({
  token,
  initialMessages = [],
}: HomeownerChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    const messageText = inputValue.trim();
    setInputValue("");
    setSending(true);

    // Optimistically add message
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      sender: "homeowner",
      message: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await fetch("/api/homeowner/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          message: messageText,
        }),
      });

      const data = await response.json();

      if (data.success && data.message) {
        // Replace temp message with real one
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessage.id ? data.message : msg
          )
        );
      } else {
        // Remove temp message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
        alert("Failed to send message. Please try again.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove temp message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      alert("An error occurred. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Ask a Question
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Messages */}
          <div className="h-64 overflow-y-auto space-y-3 pr-2">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No messages yet. Ask us anything!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender === "homeowner"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.sender === "homeowner"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.sender === "homeowner"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {format(new Date(message.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your question..."
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              size="icon"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Your messages go directly to our team. We'll respond as soon as
            possible.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}




























