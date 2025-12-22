"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SdrTunerForm({
  initialSettings,
  orgId,
}: {
  initialSettings: any;
  orgId: string;
}) {
  const [form, setForm] = useState({
    autopilot_mode: initialSettings?.autopilot_mode ?? "assist",
    aggressiveness: initialSettings?.aggressiveness ?? 2,
    max_autopilot_emails_per_lead:
      initialSettings?.max_autopilot_emails_per_lead ?? 5,
    min_minutes_between_autopilot:
      initialSettings?.min_minutes_between_autopilot ?? 480,
    send_window_start_hour:
      initialSettings?.send_window_start_hour ?? 8,
    send_window_end_hour:
      initialSettings?.send_window_end_hour ?? 17,
    weekdays_only: initialSettings?.weekdays_only ?? true,
    auto_send_ready_to_meet:
      initialSettings?.auto_send_ready_to_meet ?? true,
    auto_send_needs_info:
      initialSettings?.auto_send_needs_info ?? true,
    auto_send_follow_up_later:
      initialSettings?.auto_send_follow_up_later ?? true,
    auto_send_open_to_chat:
      initialSettings?.auto_send_open_to_chat ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/sdr-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, ...form }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
    } catch (err) {
      console.error(err);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="space-y-4 p-4 text-xs">
        <div>
          <Label className="text-[11px]">Autopilot mode</Label>
          <p className="text-[11px] text-muted-foreground">
            Off = no AI sends, Assist = prepare drafts, Auto = fully send.
          </p>
          <div className="mt-2">
            <Select
              value={form.autopilot_mode}
              onValueChange={(v) => updateField("autopilot_mode", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="assist">Assist</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">Aggressiveness</Label>
            <p className="text-[11px] text-muted-foreground">
              1 = slower, 3 = faster follow-ups.
            </p>
            <Input
              type="number"
              min={1}
              max={3}
              className="mt-1 h-8 text-xs"
              value={form.aggressiveness}
              onChange={(e) =>
                updateField("aggressiveness", Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label className="text-[11px]">
              Max AI emails per lead
            </Label>
            <Input
              type="number"
              min={1}
              className="mt-1 h-8 text-xs"
              value={form.max_autopilot_emails_per_lead}
              onChange={(e) =>
                updateField(
                  "max_autopilot_emails_per_lead",
                  Number(e.target.value),
                )
              }
            />
          </div>
          <div>
            <Label className="text-[11px]">
              Min minutes between AI emails
            </Label>
            <Input
              type="number"
              min={0}
              className="mt-1 h-8 text-xs"
              value={form.min_minutes_between_autopilot}
              onChange={(e) =>
                updateField(
                  "min_minutes_between_autopilot",
                  Number(e.target.value),
                )
              }
            />
          </div>
          <div>
            <Label className="text-[11px]">Send window</Label>
            <div className="mt-1 flex items-center gap-1 text-xs">
              <Input
                type="number"
                min={0}
                max={23}
                className="h-8 w-14"
                value={form.send_window_start_hour}
                onChange={(e) =>
                  updateField(
                    "send_window_start_hour",
                    Number(e.target.value),
                  )
                }
              />
              <span>to</span>
              <Input
                type="number"
                min={0}
                max={23}
                className="h-8 w-14"
                value={form.send_window_end_hour}
                onChange={(e) =>
                  updateField(
                    "send_window_end_hour",
                    Number(e.target.value),
                  )
                }
              />
              <span>local time</span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <Label className="text-[11px]">Weekdays only</Label>
            <p className="text-[11px] text-muted-foreground">
              Prevent AI from sending on weekends.
            </p>
          </div>
          <Switch
            checked={form.weekdays_only}
            onCheckedChange={(v) => updateField("weekdays_only", v)}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-4 text-xs">
        <p className="text-[11px] font-medium">Which intents can auto-send?</p>

        {[
          ["auto_send_ready_to_meet", "Ready to meet"],
          ["auto_send_needs_info", "Needs info"],
          ["auto_send_follow_up_later", "Follow up later"],
          ["auto_send_open_to_chat", "Open to chat"],
        ].map(([key, label]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2"
          >
            <div>
              <Label className="text-[11px]">{label}</Label>
              <p className="text-[11px] text-muted-foreground">
                Allow AI SDR to send follow-ups automatically for this intent.
              </p>
            </div>
            <Switch
              checked={(form as any)[key]}
              onCheckedChange={(v) => updateField(key, v)}
            />
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && (
          <span className="text-[11px] text-emerald-500">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

