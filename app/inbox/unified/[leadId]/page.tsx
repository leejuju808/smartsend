// Block 150000 — Unified Messaging Inbox Thread View
// Shows all messages for a specific lead across all channels

"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Message = {
  id: string;
  channel: "email" | "sms" | "widget" | "call" | "system";
  direction: "incoming" | "outgoing";
  sender: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  body: string;
  subject: string | null;
  body_html: string | null;
  created_at: string;
  read_by_users: string[] | null;
  metadata: Record<string, any>;
};

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  heat_score: number | null;
  status: string | null;
};

export default function UnifiedInboxThreadPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.leadId as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyChannel, setReplyChannel] = useState<"email" | "sms">("sms");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadCompanyId() {
      try {
        const res = await fetch("/api/me");
        const data = await res.json();
        if (data.user_id) {
          const companyRes = await fetch(
            `/api/roofing-companies?user_id=${data.user_id}`
          );
          const companyData = await companyRes.json();
          if (companyData.companies?.[0]?.id) {
            setCompanyId(companyData.companies[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading company ID:", error);
      }
    }
    loadCompanyId();
  }, []);

  useEffect(() => {
    if (!companyId || !leadId) return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inbox/unified/${leadId}?company_id=${companyId}`
        );
        const json = await res.json();
        setLead(json.lead);
        setMessages(json.messages || []);

        // Mark messages as read
        const { data: { user } } = await fetch("/api/me").then((r) => r.json());
        if (user?.id) {
          await fetch(`/api/inbox/unified/${leadId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: user.id,
              company_id: companyId,
            }),
          });
        }
      } catch (error) {
        console.error("Error loading thread:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId, leadId]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-detect best reply channel based on last message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.channel === "email" || lastMessage.channel === "sms") {
        setReplyChannel(lastMessage.channel);
      }
    }
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !companyId || !leadId) return;

    setSending(true);
    try {
      if (replyChannel === "sms") {
        // Send SMS
        const res = await fetch("/api/inbox/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: leadId,
            message: replyText,
            company_id: companyId,
          }),
        });
        if (!res.ok) throw new Error("Failed to send SMS");
      } else {
        // Send Email
        const res = await fetch("/api/inbox/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: leadId,
            subject: `Re: ${lead?.name || "Your inquiry"}`,
            body: replyText,
            company_id: companyId,
          }),
        });
        if (!res.ok) throw new Error("Failed to send email");
      }

      setReplyText("");
      // Reload messages
      const res = await fetch(
        `/api/inbox/unified/${leadId}?company_id=${companyId}`
      );
      const json = await res.json();
      setMessages(json.messages || []);
    } catch (error) {
      console.error("Error sending reply:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return "📧";
      case "sms":
        return "💬";
      case "widget":
        return "💭";
      case "call":
        return "📞";
      case "system":
        return "⚙️";
      default:
        return "📨";
    }
  };

  const getChannelLabel = (channel: string) => {
    switch (channel) {
      case "email":
        return "Email";
      case "sms":
        return "SMS";
      case "widget":
        return "Widget";
      case "call":
        return "Call";
      case "system":
        return "System";
      default:
        return channel;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Lead not found</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-semibold">
              {lead.name || lead.email || "Unknown Lead"}
            </h1>
            <div className="text-sm text-gray-500">
              {lead.email && <span>{lead.email}</span>}
              {lead.phone && (
                <span className={lead.email ? " · " : ""}>{lead.phone}</span>
              )}
              {lead.address && (
                <span className=" · ">{lead.address}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lead.heat_score !== null && (
              <span
                className={`text-sm font-semibold ${
                  lead.heat_score >= 70
                    ? "text-red-600"
                    : lead.heat_score >= 50
                    ? "text-orange-600"
                    : "text-gray-500"
                }`}
              >
                Heat: {lead.heat_score}
              </span>
            )}
            <Link
              href="/inbox/unified"
              className="text-sm px-3 py-1 border rounded-lg hover:bg-gray-50"
            >
              ← Back to Inbox
            </Link>
          </div>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.direction === "outgoing" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  message.direction === "outgoing"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-xs opacity-75">
                  <span>{getChannelIcon(message.channel)}</span>
                  <span>{getChannelLabel(message.channel)}</span>
                  <span>·</span>
                  <span>{message.sender || "Unknown"}</span>
                  <span>·</span>
                  <span>{formatTime(message.created_at)}</span>
                </div>
                {message.subject && (
                  <div className="font-semibold mb-1 text-sm">
                    {message.subject}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap">
                  {message.body}
                </div>
                {message.channel === "call" && message.metadata?.duration_seconds && (
                  <div className="text-xs mt-1 opacity-75">
                    Duration: {Math.floor(message.metadata.duration_seconds / 60)}m{" "}
                    {message.metadata.duration_seconds % 60}s
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Smart Templates */}
      <div className="border-t p-4 bg-gray-50">
        <div className="text-xs text-gray-500 mb-2">Quick Templates:</div>
        <div className="flex flex-wrap gap-2">
          <TemplateButton
            label="Request Address"
            onClick={() => {
              const template = `Hi ${lead.name || "there"},\n\nCould you please share your full address? This will help us provide you with an accurate estimate.\n\nThanks!`;
              setReplyText(template);
            }}
          />
          <TemplateButton
            label="Booking Confirmation"
            onClick={() => {
              const template = `Hi ${lead.name || "there"},\n\nGreat! We have you scheduled. We'll send you a confirmation with all the details shortly.\n\nLooking forward to helping you!`;
              setReplyText(template);
            }}
          />
          <TemplateButton
            label="Estimate Follow-Up"
            onClick={() => {
              const template = `Hi ${lead.name || "there"},\n\nJust following up on your estimate. Do you have any questions or would you like to schedule a time to discuss?\n\nLet me know!`;
              setReplyText(template);
            }}
          />
          <TemplateButton
            label="Insurance Claim Script"
            onClick={() => {
              const template = `Hi ${lead.name || "there"},\n\nI'd be happy to help you with your insurance claim. Do you have a claim number? We can work directly with your insurance company to make this process as smooth as possible.\n\nWhat's your claim number?`;
              setReplyText(template);
            }}
          />
          <TemplateButton
            label="Leak Emergency Script"
            onClick={() => {
              const template = `Hi ${lead.name || "there"},\n\nI understand this is urgent. We can get someone out there today. Can you tell me:\n1. Where is the leak?\n2. How severe is it?\n3. What's your availability today?\n\nWe'll get this taken care of ASAP!`;
              setReplyText(template);
            }}
          />
        </div>
      </div>

      {/* Reply Box */}
      <div className="border-t p-4 bg-white">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-gray-500">Reply via:</span>
          <button
            onClick={() => setReplyChannel("sms")}
            className={`text-xs px-2 py-1 rounded ${
              replyChannel === "sms"
                ? "bg-green-500 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            💬 SMS
          </button>
          <button
            onClick={() => setReplyChannel("email")}
            className={`text-xs px-2 py-1 rounded ${
              replyChannel === "email"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            📧 Email
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Type your ${replyChannel === "sms" ? "SMS" : "email"} reply...`}
            className="flex-1 border rounded-lg p-2 text-sm resize-none"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSendReply();
              }
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || sending}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Press Cmd/Ctrl + Enter to send
        </div>
      </div>
    </div>
  );
}

function TemplateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 bg-white border rounded-lg hover:bg-gray-50 text-gray-700"
    >
      {label}
    </button>
  );
}


























