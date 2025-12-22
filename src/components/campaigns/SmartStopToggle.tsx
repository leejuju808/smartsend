"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SmartStopToggleProps = {
  campaignId: string;
  initialValue?: boolean;
};

export function SmartStopToggle({
  campaignId,
  initialValue = true,
}: SmartStopToggleProps) {
  const [autoStopOnAnyReply, setAutoStopOnAnyReply] = React.useState(
    initialValue
  );
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`);
        const data = await response.json();
        if (data.campaign?.auto_stop_on_any_reply !== undefined) {
          setAutoStopOnAnyReply(data.campaign.auto_stop_on_any_reply);
        }
      } catch (err) {
        console.error("Failed to load campaign SmartStop setting:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_stop_on_any_reply: autoStopOnAnyReply,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save settings");
      }

      toast.success("SmartStop setting saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      toast.error(message);
      console.error("Failed to save SmartStop setting:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
        <div className="text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <Label className="text-xs font-semibold">
            Stop follow-ups on any reply
          </Label>
          <p className="text-[11px] text-muted-foreground mt-1">
            When enabled, SmartSend will automatically stop this campaign&apos;s
            sequence for a lead as soon as they reply (except bounces and
            unsubscribes, which always stop). Turn this off if you want to
            keep sending sequences after neutral/negative replies.
          </p>
        </div>
        <Switch
          checked={autoStopOnAnyReply}
          onCheckedChange={(v) => setAutoStopOnAnyReply(v)}
          disabled={saving}
        />
      </div>
      <div className="flex justify-end mt-3">
        <Button
          size="sm"
          className="h-8 px-3 text-[11px]"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}




