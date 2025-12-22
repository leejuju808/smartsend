"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { upsertWarmupAccount, getWarmupAccount } from "@/app/actions/updateWarmupAccount";

type Mailbox = {
  email: string;
  provider?: string;
};

type WarmupAccount = {
  id: string;
  from_email: string;
  is_enabled: boolean;
  max_per_day: number;
  start_per_day: number;
  ramp_per_day: number;
  current_per_day: number;
  sent_today: number;
  last_sent_date: string | null;
};

export function WarmupSettingsCard({ mailbox }: { mailbox: Mailbox }) {
  const [enabled, setEnabled] = React.useState(false);
  const [startPerDay, setStartPerDay] = React.useState(5);
  const [maxPerDay, setMaxPerDay] = React.useState(30);
  const [rampPerDay, setRampPerDay] = React.useState(2);
  const [warmup, setWarmup] = React.useState<WarmupAccount | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    loadWarmupSettings();
  }, [mailbox.email]);

  async function loadWarmupSettings() {
    try {
      setLoading(true);
      const data = await getWarmupAccount(mailbox.email);
      if (data) {
        setWarmup(data);
        setEnabled(data.is_enabled);
        setStartPerDay(data.start_per_day);
        setMaxPerDay(data.max_per_day);
        setRampPerDay(data.ramp_per_day);
      }
    } catch (error) {
      console.error("Error loading warmup settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      await upsertWarmupAccount({
        fromEmail: mailbox.email,
        isEnabled: enabled,
        startPerDay,
        maxPerDay,
        rampPerDay,
      });
      toast.success("Warmup settings saved");
      await loadWarmupSettings();
    } catch (error: any) {
      toast.error(error.message || "Failed to save warmup settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading warmup settings...</div>
      </Card>
    );
  }

  const sentToday = warmup?.sent_today || 0;
  const currentPerDay = warmup?.current_per_day || startPerDay;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{mailbox.email}</p>
          <p className="text-xs text-muted-foreground">
            Simple warmup to slowly ramp volume.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <Label className="block text-xs mb-1">Start / day</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={startPerDay}
                onChange={(e) => setStartPerDay(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="block text-xs mb-1">Max / day</Label>
              <Input
                type="number"
                min="1"
                max="500"
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="block text-xs mb-1">Ramp / day</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={rampPerDay}
                onChange={(e) => setRampPerDay(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t">
            <span className="text-muted-foreground">Sent today:</span>
            <span className="font-medium">
              {sentToday} / {currentPerDay}
            </span>
          </div>
        </>
      )}

      <Button
        size="sm"
        className="mt-2 w-full"
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save warmup settings"}
      </Button>
    </Card>
  );
}








