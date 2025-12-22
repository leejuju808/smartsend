"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SendingPrefsPayload = {
  campaign_id: string;
  ooo_hold_days: number;
  honor_snooze: boolean;
};

export function SendingPrefs({ campaignId }: { campaignId: string }) {
  const [days, setDays] = useState<number>(14);
  const [honor, setHonor] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/sending-prefs`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load sending prefs (${response.status})`);
        }

        const payload: { item?: SendingPrefsPayload } = await response.json();
        if (!isMounted) return;

        if (payload?.item) {
          setDays(payload.item.ooo_hold_days ?? 14);
          setHonor(payload.item.honor_snooze ?? true);
        }
      } catch (error) {
        console.error("Failed to fetch campaign sending prefs", error);
        if (isMounted) {
          toast.error("Unable to load outbound guard settings.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [campaignId]);

  const handleDaysChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setDays(0);
      return;
    }
    setDays(parsed);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/sending-prefs`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ooo_hold_days: days,
          honor_snooze: honor,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save outbound guard settings.");
      }

      if (payload?.item) {
        setDays(payload.item.ooo_hold_days ?? days);
        setHonor(payload.item.honor_snooze ?? honor);
      }

      toast.success("Outbound guard updated.");
    } catch (error) {
      console.error("Failed to save campaign sending prefs", error);
      toast.error(error instanceof Error ? error.message : "Failed to save outbound guard.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-5">
        <div className="text-lg font-semibold">Outbound Guard</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-center">
          <div>
            <Label>Hold days after OOO (0 = disabled)</Label>
            <Input
              type="number"
              min={0}
              value={Number.isFinite(days) ? days : ""}
              onChange={(event) => handleDaysChange(event.target.value)}
              disabled={loading || saving}
            />
          </div>
          <div className="mt-4 flex items-center gap-3 md:mt-0">
            <Switch
              checked={honor}
              onCheckedChange={setHonor}
              disabled={loading || saving}
            />
            <span className="text-sm">Honor return dates (snooze-until)</span>
          </div>
          <div className="md:text-right">
            <Button onClick={() => void save()} disabled={loading || saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          If a lead sent an out-of-office within the last <b>{days}</b> day(s), SmartSend pauses future sends automatically.
          When enabled, we&rsquo;ll also respect any return date from their OOO reply.
        </p>
      </CardContent>
    </Card>
  );
}

