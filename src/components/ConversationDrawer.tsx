"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { SmartReply } from "@/components/SmartReply";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EmailMessage {
  id: string;
  thread_id: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body_html: string;
  direction: 'sent' | 'received';
  sent_at: string;
}

interface ThreadInfo {
  id: string;
  workspace_id: string;
  lead_email: string;
  subject: string | null;
  last_intent: string | null;
}

interface ConversationDrawerProps {
  threadId: string;
  onClose: () => void;
}

export default function ConversationDrawer({ threadId, onClose }: ConversationDrawerProps) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);
  const [workspaceSettings, setWorkspaceSettings] = useState<{
    booking_link?: string;
    signature_html?: string;
  } | null>(null);
  const [leadInfo, setLeadInfo] = useState<{
    first_name?: string;
    company?: string;
  }>({});

  useEffect(() => {
    if (!threadId) return;

    const load = async () => {
      // Load messages
      const { data: messagesData } = await supabase
        .from("email_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: true });
      if (messagesData) setMessages(messagesData);

      // Load thread info
      const { data: threadData } = await supabase
        .from("email_threads")
        .select("id, workspace_id, lead_email, subject, last_intent")
        .eq("id", threadId)
        .single();
      if (threadData) {
        setThreadInfo(threadData);

        // Load workspace settings
        const { data: settingsData } = await supabase
          .from("workspace_settings")
          .select("booking_link, signature_html")
          .eq("workspace_id", threadData.workspace_id)
          .maybeSingle();
        if (settingsData) setWorkspaceSettings(settingsData);

        // Try to get lead info from contacts/leads
        const { data: contactData } = await supabase
          .from("contacts")
          .select("first_name, company")
          .eq("email", threadData.lead_email)
          .maybeSingle();
        if (contactData) {
          setLeadInfo({
            first_name: contactData.first_name || undefined,
            company: contactData.company || undefined,
          });
        } else {
          // Try leads table
          const { data: leadData } = await supabase
            .from("leads")
            .select("email, first_name, company")
            .eq("email", threadData.lead_email)
            .maybeSingle();
          if (leadData) {
            setLeadInfo({
              first_name: leadData.first_name || undefined,
              company: leadData.company || undefined,
            });
          }
        }
      }
    };

    load();

    // Live updates
    const channel = supabase
      .channel("msg_updates")
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "email_messages", 
          filter: `thread_id=eq.${threadId}` 
        },
        (payload) => setMessages((m) => [...m, payload.new as EmailMessage])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  async function sendReply(bodyHtml?: string) {
    const htmlToSend = bodyHtml || replyText;
    if (!htmlToSend.trim() || sending) return;

    setSending(true);
    try {
      const subject = threadInfo?.subject ? `Re: ${threadInfo.subject}` : "Re:";
      const res = await fetch("/api/send/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          thread_id: threadId, 
          body_html: htmlToSend,
          subject 
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error?.error || "Failed to send reply");
        return;
      }

      setReplyText("");
    } catch (error) {
      console.error("Error sending reply:", error);
      alert("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleSmartReplyInsert({ subject, html }: { subject: string; html: string }) {
    await sendReply(html);
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-xl border-l border-gray-200 flex flex-col z-50">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-semibold">Conversation</h2>
        <Button variant="ghost" onClick={onClose} size="sm">✕</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-8">No messages yet</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`p-3 rounded-lg ${
                m.direction === "sent" 
                  ? "bg-amber-100 ml-auto max-w-[80%]" 
                  : "bg-gray-100 mr-auto max-w-[80%]"
              }`}
            >
              <div 
                className="text-sm"
                dangerouslySetInnerHTML={{ __html: m.body_html }} 
              />
              <div className="text-xs text-gray-400 mt-1">
                {new Date(m.sent_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      <SmartReply
        threadId={threadId}
        defaultIntent={threadInfo?.last_intent}
        variables={{
          first_name: leadInfo.first_name || "there",
          company: leadInfo.company || "",
          link_book: workspaceSettings?.booking_link || "",
        }}
        onInsert={handleSmartReplyInsert}
      />

      <div className="border-t p-3 flex gap-2 bg-white">
        <Input
          placeholder="Type your reply..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendReply();
            }
          }}
        />
        <Button onClick={() => sendReply()} disabled={!replyText.trim() || sending}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

