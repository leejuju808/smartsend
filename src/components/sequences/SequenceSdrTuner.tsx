"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, SlidersHorizontal, Loader2 } from "lucide-react";

export function SequenceSdrTuner({
  orgId,
  sequenceId,
  globalSettings,
  override,
}: {
  orgId: string;
  sequenceId: string;
  globalSettings: any;
  override: any;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    autopilot_mode_override: override?.autopilot_mode_override ?? "",
    aggressiveness_override:
      override?.aggressiveness_override?.toString() ?? "",
    max_autopilot_emails_per_lead_override:
      override?.max_autopilot_emails_per_lead_override?.toString() ?? "",
    min_minutes_between_autopilot_override:
      override?.min_minutes_between_autopilot_override?.toString() ?? "",
    auto_send_ready_to_meet_override:
      override?.auto_send_ready_to_meet_override ?? null,
    auto_send_needs_info_override:
      override?.auto_send_needs_info_override ?? null,
    auto_send_follow_up_later_override:
      override?.auto_send_follow_up_later_override ?? null,
    auto_send_open_to_chat_override:
      override?.auto_send_open_to_chat_override ?? null,
  });

  const onChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/sdr-sequence-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          sequence_id: sequenceId,
          autopilot_mode_override:
            form.autopilot_mode_override || null,
          aggressiveness_override: form.aggressiveness_override
            ? Number(form.aggressiveness_override)
            : null,
          max_autopilot_emails_per_lead_override:
            form.max_autopilot_emails_per_lead_override
              ? Number(form.max_autopilot_emails_per_lead_override)
              : null,
          min_minutes_between_autopilot_override:
            form.min_minutes_between_autopilot_override
              ? Number(form.min_minutes_between_autopilot_override)
              : null,
          auto_send_ready_to_meet_override:
            form.auto_send_ready_to_meet_override,
          auto_send_needs_info_override:
            form.auto_send_needs_info_override,
          auto_send_follow_up_later_override:
            form.auto_send_follow_up_later_override,
          auto_send_open_to_chat_override:
            form.auto_send_open_to_chat_override,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      // Optional: toast, etc.
      window.location.reload(); // Refresh to show updated values
    } catch (err) {
      console.error(err);
      alert("Failed to save sequence overrides");
    } finally {
      setSaving(false);
    }
  };

  const intentToggle = (
    key: keyof typeof form,
    label: string,
    desc: string,
    globalKey: string,
  ) => {
    const value = form[key] as boolean | null;
    const globalValue = globalSettings?.[globalKey] ?? false;
    return (
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-[11px]">{label}</Label>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
          <p className="text-[10px] text-muted-foreground">
            Global: {globalValue ? "On" : "Off"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge className="text-[9px]" variant="outline">
            {value === null ? "Inherit" : value ? "On" : "Off"}
          </Badge>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(key as string, null)}
              className="text-[9px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
            <Switch
              checked={value === true}
              onCheckedChange={(v) => onChange(key as string, v)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="space-y-4 p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500" />
          <div>
            <h3 className="text-sm font-semibold">
              AI SDR for this sequence
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Override org-wide SDR behavior just for this sequence.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          <SlidersHorizontal className="mr-1 h-3 w-3" />
          Sequence-level override
        </Badge>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Autopilot mode</Label>
            <p className="text-[11px] text-muted-foreground">
              Leave blank to inherit org mode (
              {globalSettings?.autopilot_mode || "assist"}).
            </p>
            <Select
              value={form.autopilot_mode_override || "inherit"}
              onValueChange={(v) =>
                onChange(
                  "autopilot_mode_override",
                  v === "inherit" ? "" : v,
                )
              }
            >
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Inherit from org" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit</SelectItem>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="assist">Assist</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Aggressiveness</Label>
            <p className="text-[11px] text-muted-foreground">
              1 = slower, 3 = faster. Global:{" "}
              {globalSettings?.aggressiveness ?? 2}
            </p>
            <Input
              type="number"
              min={1}
              max={3}
              className="mt-1 h-8 text-xs"
              placeholder="Inherit"
              value={form.aggressiveness_override}
              onChange={(e) =>
                onChange("aggressiveness_override", e.target.value)
              }
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Max AI emails per lead</Label>
            <p className="text-[11px] text-muted-foreground">
              Global: {globalSettings?.max_autopilot_emails_per_lead ?? 5}
            </p>
            <Input
              type="number"
              min={1}
              className="mt-1 h-8 text-xs"
              placeholder="Inherit"
              value={form.max_autopilot_emails_per_lead_override}
              onChange={(e) =>
                onChange(
                  "max_autopilot_emails_per_lead_override",
                  e.target.value,
                )
              }
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">
              Min minutes between AI emails
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Global: {globalSettings?.min_minutes_between_autopilot ?? 480}
            </p>
            <Input
              type="number"
              min={0}
              className="mt-1 h-8 text-xs"
              placeholder="Inherit"
              value={form.min_minutes_between_autopilot_override}
              onChange={(e) =>
                onChange(
                  "min_minutes_between_autopilot_override",
                  e.target.value,
                )
              }
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {intentToggle(
            "auto_send_ready_to_meet_override",
            "Ready to meet",
            "Allow AI SDR to auto-send when lead is ready to meet.",
            "auto_send_ready_to_meet",
          )}
          {intentToggle(
            "auto_send_needs_info_override",
            "Needs info",
            "Allow AI SDR to auto-send educational follow-ups.",
            "auto_send_needs_info",
          )}
          {intentToggle(
            "auto_send_follow_up_later_override",
            "Follow up later",
            "Allow AI SDR to schedule follow-ups later.",
            "auto_send_follow_up_later",
          )}
          {intentToggle(
            "auto_send_open_to_chat_override",
            "Open to chat",
            "Allow AI SDR to continue the conversation automatically.",
            "auto_send_open_to_chat",
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              "Save sequence overrides"
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

