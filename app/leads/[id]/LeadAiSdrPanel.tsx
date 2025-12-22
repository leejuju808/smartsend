"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Bot, Shield, Loader2, MessageCircle, Sparkles } from "lucide-react";

type TouchStats = {
  aiEmailsCount: number;
  humanEmailsCount: number;
  totalReplies: number;
  interestedReplies: number;
  lastTouch: { type: string; created_at: string } | null;
};

type Persona = {
  id: string;
  name: string;
};

export function LeadAiSdrPanel({
  lead,
  touchStats,
  personas,
}: {
  lead: any;
  touchStats: TouchStats;
  personas: Persona[];
}) {
  const [optOut, setOptOut] = useState<boolean>(!!lead.ai_sdr_opt_out);
  const [reason, setReason] = useState<string>(lead.ai_sdr_opt_out_reason || "");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(lead.ai_persona_id || "");
  const [saving, setSaving] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setOptOut(checked);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/lead-ai-sdr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          opt_out: optOut,
          reason: optOut ? reason : null,
        }),
      });

      if (!res.ok) throw new Error("failed");
    } catch (err) {
      console.error(err);
      alert("Failed to update AI SDR setting for this lead");
    } finally {
      setSaving(false);
    }
  };

  const handlePersonaChange = async (personaId: string) => {
    setSelectedPersonaId(personaId);
    setSavingPersona(true);
    try {
      const res = await fetch("/api/lead-ai-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          persona_id: personaId || null,
        }),
      });

      if (!res.ok) throw new Error("failed");
    } catch (err) {
      console.error(err);
      alert("Failed to update persona for this lead");
      setSelectedPersonaId(lead.ai_persona_id || "");
    } finally {
      setSavingPersona(false);
    }
  };

  const lastTouchLabel = (() => {
    if (!touchStats.lastTouch) return "No touches yet";
    const d = new Date(touchStats.lastTouch.created_at);
    const type = touchStats.lastTouch.type;

    const typeLabel =
      type === "ai_email"
        ? "AI email"
        : type === "human_email"
        ? "Human email"
        : "Reply";

    return `${typeLabel} · ${d.toLocaleString()}`;
  })();

  return (
    <Card className="space-y-4 p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500" />
          <div>
            <h3 className="text-sm font-semibold">
              AI SDR for this lead
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Kill-switch AI outreach or let it keep working this contact.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            optOut
              ? "border-red-500/40 bg-red-500/10 text-[10px] text-red-500"
              : "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-500"
          }
        >
          {optOut ? "AI SDR off" : "AI SDR on"}
        </Badge>
      </div>

      {/* Persona picker */}
      {personas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
            <Label className="text-[11px] font-semibold">AI SDR Persona</Label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Override the org default persona for this specific lead. Controls tone, style, and formality.
          </p>
          <Select
            value={selectedPersonaId}
            onValueChange={handlePersonaChange}
            disabled={savingPersona}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Use org default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Use org default</SelectItem>
              {personas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {savingPersona && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </p>
          )}
        </div>
      )}

      {/* Toggle + reason */}
      <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label className="text-[11px]">Allow AI SDR for this lead</Label>
            <p className="text-[11px] text-muted-foreground">
              When off, no AI SDR follow-ups will be generated or sent to this contact.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <Switch
              checked={!optOut}
              onCheckedChange={(checked) => handleToggle(!checked)}
            />
          </div>
        </div>

        {optOut && (
          <div className="space-y-1">
            <Label className="text-[11px]">Reason (optional)</Label>
            <Textarea
              className="min-h-[60px] text-[11px]"
              placeholder="e.g. Asked to stop AI emails, only want human replies."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      {/* Touch summary */}
      <div className="space-y-2 rounded-md border bg-card/60 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold">
              AI vs human touch history
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {lastTouchLabel}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/60 p-2">
            <p className="text-[10px] text-muted-foreground">
              AI SDR emails
            </p>
            <p className="text-lg font-semibold">
              {touchStats.aiEmailsCount}
            </p>
          </div>
          <div className="rounded-md bg-muted/60 p-2">
            <p className="text-[10px] text-muted-foreground">
              Human emails
            </p>
            <p className="text-lg font-semibold">
              {touchStats.humanEmailsCount}
            </p>
          </div>
          <div className="rounded-md bg-muted/60 p-2">
            <p className="text-[10px] text-muted-foreground">
              Replies / Interested
            </p>
            <p className="text-lg font-semibold">
              {touchStats.totalReplies}
              <span className="text-[10px] text-emerald-500">
                {" "}
                ({touchStats.interestedReplies})
              </span>
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

