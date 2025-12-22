"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SnippetsDropdown } from "./SnippetsDropdown";
import { createBrowserClient } from "@/lib/supabase/client";
import { Loader2, Bot } from "lucide-react";

type Thread = {
  id: string;
  subject?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null;
  workspace_id?: string | null;
  mailbox?: {
    email?: string;
    id?: string;
  } | null;
  draft_body?: string | null;
};

type ReplyComposerProps = {
  thread: Thread;
  onSent?: () => void;
};

export function ReplyComposer({ thread, onSent }: ReplyComposerProps) {
  const [value, setValue] = useState(thread.draft_body || "");
  const [loadingAI, setLoadingAI] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);
  const supabase = createBrowserClient();

  // Load draft on mount
  useEffect(() => {
    if (thread.draft_body) {
      setValue(thread.draft_body);
    }
  }, [thread.draft_body]);

  // Debounced draft save
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (value.trim() && value !== thread.draft_body) {
        saveDraft(value);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [value]);

  const saveDraft = async (draftValue: string) => {
    try {
      await supabase
        .from("reply_threads")
        .update({ draft_body: draftValue })
        .eq("id", thread.id);
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  };

  const loadSuggestion = async () => {
    setLoadingAI(true);
    try {
      const res = await fetch(`/api/replies/${thread.id}/suggest`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.suggestion) {
        setValue(data.suggestion);
      }
    } catch (error) {
      console.error("Failed to load suggestion:", error);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleDraftReply = async () => {
    if (!thread.lead_id) {
      alert("Lead ID is required for AI draft");
      return;
    }

    setLoadingAI(true);
    try {
      // Fetch thread messages
      const { data: messages } = await supabase
        .from("messages")
        .select("body_text, body_html, direction, created_at, from_email, to_email")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });

      if (!messages || messages.length === 0) {
        alert("No messages found in thread");
        return;
      }

      // Build thread array format
      const threadArray = messages.map((m: any) => {
        const isFromLead = m.direction === "in" || m.direction === "inbound";
        const body = m.body_html || m.body_text || "";
        return {
          from: isFromLead ? "lead" as const : "me" as const,
          body: body,
          ts: new Date(m.created_at).toISOString(),
        };
      });

      // Get lead info for notes
      const { data: lead } = await supabase
        .from("leads")
        .select("notes_summary, campaign_id")
        .eq("id", thread.lead_id)
        .maybeSingle();

      // Get persona prompt from campaign or user settings
      let personaPrompt = "You are an elite SDR email assistant.";
      
      if (thread.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("ai_sdr_playbook_id")
          .eq("id", thread.campaign_id)
          .maybeSingle();

        if (campaign?.ai_sdr_playbook_id) {
          const { data: playbook } = await supabase
            .from("ai_sdr_playbooks")
            .select("target_persona, messaging_guidelines")
            .eq("id", campaign.ai_sdr_playbook_id)
            .maybeSingle();

          if (playbook) {
            personaPrompt = `Target Persona: ${playbook.target_persona || ""}\nMessaging Guidelines: ${playbook.messaging_guidelines || ""}`;
          }
        }
      }

      // Call API
      const res = await fetch("/api/ai-sdr/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: thread.lead_id,
          thread: threadArray,
          persona_prompt: personaPrompt,
          sdr_notes: lead?.notes_summary || "",
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to generate draft" }));
        throw new Error(error.error || "Failed to generate draft");
      }

      const data = await res.json();
      if (data.draft) {
        setValue(data.draft);
      } else {
        alert("No draft received from API");
      }
    } catch (error) {
      console.error("Failed to generate AI draft:", error);
      alert(error instanceof Error ? error.message : "Failed to generate AI draft");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSend = async () => {
    if (!value.trim()) return;
    
    setSending(true);
    try {
      const res = await fetch(`/api/replies/${thread.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: value,
          mailbox_id: selectedMailboxId || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(error.error || "Failed to send reply");
      }

      setValue("");
      onSent?.();
    } catch (error) {
      console.error("Failed to send reply:", error);
      alert(error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = async (action: "book_call" | "send_info" | "not_fit") => {
    // For v1, we'll use simple snippet-based responses
    // In future, this could call AI with mode parameter
    const snippets: Record<string, string> = {
      book_call: "I'd love to schedule a quick call to discuss this further. Are you available this week? You can book a time that works for you at {{booking_link}}.",
      send_info: "I'd be happy to share more information. You can find details about our pricing and features at {{pricing_page}}. Let me know if you have any questions!",
      not_fit: "Thanks for getting back to me. I understand this might not be the right fit at the moment. If your situation changes, feel free to reach out anytime.",
    };

    const snippet = snippets[action];
    if (snippet) {
      setValue((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
    }
  };

  const handleInsertSnippet = (snippet: string) => {
    setValue((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
  };

  // Load available mailboxes
  const [mailboxes, setMailboxes] = useState<Array<{ id: string; email: string }>>([]);
  
  useEffect(() => {
    const loadMailboxes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: mbData } = await supabase
        .from("mailboxes")
        .select("id, from_email")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (mbData) {
        setMailboxes(mbData.map((mb: any) => ({ id: mb.id, email: mb.from_email || "" })));
        if (mbData.length > 0 && !selectedMailboxId) {
          setSelectedMailboxId(mbData[0].id);
        }
      }
    };
    loadMailboxes();
  }, []);

  return (
    <div className="border-t pt-3 mt-4 space-y-3">
      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleQuickAction("book_call")}
          className="text-xs"
        >
          Book a Call
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleQuickAction("send_info")}
          className="text-xs"
        >
          Send Info
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleQuickAction("not_fit")}
          className="text-xs"
        >
          Not a Fit
        </Button>
      </div>

      {/* Composer Header */}
      <div className="flex justify-between items-center">
        <span className="text-xs opacity-70">
          Reply as {thread.mailbox?.email || mailboxes.find(m => m.id === selectedMailboxId)?.email || "Select mailbox"}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleDraftReply}
            disabled={loadingAI || !thread.lead_id}
          >
            {loadingAI ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Drafting…
              </>
            ) : (
              <>
                <Bot className="h-3 w-3 mr-1" />
                AI Draft Reply
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadSuggestion}
            disabled={loadingAI}
          >
            {loadingAI ? "Thinking…" : "AI Suggest Reply"}
          </Button>
          <SnippetsDropdown onInsert={handleInsertSnippet} />
        </div>
      </div>

      {/* Textarea */}
      <Textarea
        rows={4}
        placeholder="Type your reply…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      {/* Footer */}
      <div className="flex justify-between items-center">
        {mailboxes.length > 1 && (
          <select
            value={selectedMailboxId || ""}
            onChange={(e) => setSelectedMailboxId(e.target.value)}
            className="text-xs border rounded px-2 py-1"
          >
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>
                {mb.email}
              </option>
            ))}
          </select>
        )}
        <Button onClick={handleSend} disabled={!value.trim() || sending}>
          {sending ? "Sending…" : "Send Reply"}
        </Button>
      </div>
    </div>
  );
}

