"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type ReplyRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  from_email: string;
  subject: string | null;
  body: string;
  thread_id: string | null;
  provider_message_id: string | null;
  received_at: string;
  lead?: { 
    email: string; 
    first_name: string | null; 
    last_name: string | null; 
    company: string | null; 
    campaign_id: string | null;
  };
};

interface SmartReplyPanelProps {
  reply: ReplyRow;
  onSent?: () => void;
}

export default function SmartReplyPanel({ reply, onSent }: SmartReplyPanelProps) {
  const [tone, setTone] = useState<"casual" | "professional" | "bold">("professional");
  const [cta, setCta] = useState("Book a 15-min call");
  const [product, setProduct] = useState("");
  const [body, setBody] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    checkGmailConnection();
  }, []);

  async function checkGmailConnection() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from("provider_accounts")
        .select("email_address")
        .eq("user_id", user.id)
        .eq("provider", "gmail")
        .maybeSingle();
      
      setGmailConnected(!!data);
    } catch (error) {
      console.error("Error checking Gmail connection:", error);
    } finally {
      setCheckingConnection(false);
    }
  }

  async function generate() {
    if (!reply) return;
    
    setIsPending(true);
    try {
      const res = await fetch("/api/replies/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply_id: reply.id,
          workspace_id: reply.workspace_id,
          lead_id: reply.lead_id,
          tone,
          cta,
          product_context: product,
          original_message: reply.body,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate draft");
      }

      const data = await res.json();
      setBody(data.draft || data.body || "");
      setDraftId(data.draft_id || null);
    } catch (e: any) {
      alert(e.message || "Failed to generate draft");
    } finally {
      setIsPending(false);
    }
  }

  async function send() {
    if (!body.trim() || !reply) return;

    setIsPending(true);
    try {
      // Use the new /api/reply endpoint
      // Note: thread_id should reference emails.id, using reply.id as thread_id for now
      // You may need to adjust this based on your actual data structure
      const subject = reply.subject?.startsWith("Re:") ? reply.subject : `Re: ${reply.subject || "(no subject)"}`;
      
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: reply.id, // This should be the emails.id, adjust if needed
          to: reply.from_email,
          subject: subject,
          body: stripHtml(body), // Send plain text
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send");
      }

      const data = await res.json();
      if (!data.ok && data.send_error) {
        throw new Error(`Send failed: ${data.send_error}`);
      }

      // Dispatch optimistic update event for inbox
      window.dispatchEvent(new CustomEvent("inbox-local-update", {
        detail: { 
          id: reply.id, 
          patch: { 
            status: "replied", 
            updated_at: new Date().toISOString() 
          } 
        }
      }));

      // Clear the draft
      setBody("");
      setDraftId(null);
      
      // Call optional callback (e.g., to mark reply as handled)
      if (onSent) {
        onSent();
      }
      
      alert("Reply sent successfully!");
    } catch (e: any) {
      alert(e.message || "Failed to send reply");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Smart Reply Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Tone</Label>
          <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
            <SelectTrigger>
              <SelectValue placeholder="Select tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>CTA</Label>
          <Input
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Book a 15-min call"
          />
        </div>

        <div className="space-y-1">
          <Label>Product context</Label>
          <Input
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Brief description of your product/service"
          />
        </div>

        <div className="space-y-1">
          <Label>Draft</Label>
          <Textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Click Generate to create a draft..."
          />
        </div>

        {!checkingConnection && !gmailConnected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <p className="mb-2">Gmail not connected. Connect Gmail to send replies.</p>
            <Button size="sm" onClick={() => router.push("/settings/email")}>
              Connect Gmail
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={generate} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate"
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={send}
            disabled={isPending || !body.trim() || !gmailConnected}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function wrapSignature(body: string): string {
  return `${body}<br/><br/><div style="opacity:.7;font-size:12px">— Sent with SmartSend ⚡</div>`;
}

