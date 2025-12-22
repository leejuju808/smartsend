"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import UpgradeModal from "@/components/UpgradeModal";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { sendNow } from "@/lib/sendNow";

export function AutoDraftBar({
  threadId,
  lastInboundId,
  onInsert,
  campaignId,
  leadId,
  fromAccountId,
}: {
  threadId: string;
  lastInboundId: string;
  onInsert: (subject: string, body: string) => void;
  campaignId?: string | null;
  leadId?: string | null;
  fromAccountId?: string | null;
}) {
  const [tone, setTone] = useState("concise");
  const [loading, setLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { push: pushToast } = useToast();

  const canSend = useMemo(
    () => Boolean(body?.trim() && campaignId && leadId && fromAccountId),
    [body, campaignId, leadId, fromAccountId]
  );

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/functions/v1/reply-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message_id: lastInboundId, tone }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        if (j?.subject) setSubject(j.subject);
        if (j?.body) setBody(j.body);
      } else {
        console.error("AutoDraft generate failed", j);
      }
    } finally {
      setLoading(false);
    }
  }

  function insert() {
    onInsert(subject || "", body || "");
  }

  async function handleSendNow() {
    if (!canSend) return;
    setSendLoading(true);
    try {
      const res = await sendNow({
        threadId,
        campaignId: campaignId!,
        leadId: leadId!,
        fromAccountId: fromAccountId ?? undefined,
        subject: subject || "Re: Quick follow-up",
        body: body || "",
        provider: "gmail",
        mode: "explicit",
      });
      if (res?.ok) {
        pushToast({
          type: "success",
          title: "Sent",
          description: "Email sent successfully",
        });
        try {
          (window as any)?.mutateThread?.();
        } catch (error) {
          console.debug("auto-draft-bar mutateThread noop", error);
        }
        try {
          (window as any)?.mutateMessages?.();
        } catch (error) {
          console.debug("auto-draft-bar mutateMessages noop", error);
        }
      } else {
        pushToast({
          type: "error",
          title: "Send failed",
          description: "Unknown error sending email",
        });
      }
    } catch (error: any) {
      if (error?.code === "quota_exceeded" || error?.status === 402) {
        setShowUpgrade(true);
        return;
      }
      pushToast({
        type: "error",
        title: "Send failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-3 bg-muted/30 space-y-2">
      <div className="text-sm font-medium">Auto-Draft</div>
      <div className="flex items-center gap-2">
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="concise">Concise</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={generate} disabled={loading}>
          Suggest Reply
        </Button>
        <Button size="sm" variant="outline" onClick={insert} disabled={!body}>
          Insert to Composer
        </Button>
        <Button
          size="sm"
          variant="default"
          disabled={!canSend || sendLoading}
          onClick={handleSendNow}
        >
          {sendLoading ? "Sending…" : "Send Now"}
        </Button>
      </div>
      <div className="grid gap-2">
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          rows={6}
          placeholder="Draft body..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
}

