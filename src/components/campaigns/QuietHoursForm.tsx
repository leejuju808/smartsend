"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

type CampaignPolicy = {
  days_allowed: number[] | null;
  hour_start: number | null;
  hour_end: number | null;
  block_holidays: boolean | null;
  tz_source: "lead" | "campaign" | null;
  campaign_tz: string | null;
  campaign_country: string | null;
  min_gap_minutes: number | null;
};

type QuietHoursFormProps = {
  campaignId: string;
  initialPolicy: CampaignPolicy | null;
};

const DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function QuietHoursForm({ campaignId, initialPolicy }: QuietHoursFormProps) {
  const defaults = useMemo(
    () => ({
      days: initialPolicy?.days_allowed ?? [1, 2, 3, 4, 5],
      hourStart: initialPolicy?.hour_start ?? 8,
      hourEnd: initialPolicy?.hour_end ?? 18,
      blockHolidays: initialPolicy?.block_holidays ?? true,
      tzSource: initialPolicy?.tz_source ?? "lead",
      campaignTz: initialPolicy?.campaign_tz ?? "",
      campaignCountry: initialPolicy?.campaign_country ?? "",
      minGap: initialPolicy?.min_gap_minutes ?? 30,
    }),
    [initialPolicy],
  );

  const [days, setDays] = useState<number[]>(defaults.days);
  const [hourStart, setHourStart] = useState(defaults.hourStart);
  const [hourEnd, setHourEnd] = useState(defaults.hourEnd);
  const [blockHolidays, setBlockHolidays] = useState(defaults.blockHolidays);
  const [tzSource, setTzSource] = useState<"lead" | "campaign">(defaults.tzSource);
  const [campaignTz, setCampaignTz] = useState(defaults.campaignTz);
  const [campaignCountry, setCampaignCountry] = useState(defaults.campaignCountry);
  const [minGap, setMinGap] = useState(defaults.minGap);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setDays(defaults.days);
    setHourStart(defaults.hourStart);
    setHourEnd(defaults.hourEnd);
    setBlockHolidays(defaults.blockHolidays);
    setTzSource(defaults.tzSource);
    setCampaignTz(defaults.campaignTz);
    setCampaignCountry(defaults.campaignCountry);
    setMinGap(defaults.minGap);
  }, [defaults]);

  const toggleDay = (value: number) => {
    setDays((prev) => {
      const exists = prev.includes(value);
      if (exists) {
        return prev.filter((d) => d !== value);
      }
      return [...prev, value].sort((a, b) => a - b);
    });
  };

  const onSave = async () => {
    if (!days.length) {
      toast({
        title: "Select at least one day",
        description: "Choose the days you want to allow sends.",
        variant: "destructive",
      });
      return;
    }

    if (hourStart >= hourEnd) {
      toast({
        title: "Invalid window",
        description: "End hour must be greater than start hour.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        days_allowed: days,
        hour_start: hourStart,
        hour_end: hourEnd,
        block_holidays: blockHolidays,
        tz_source: tzSource,
        campaign_tz:
          tzSource === "campaign" ? campaignTz.trim() || null : null,
        campaign_country:
          tzSource === "campaign"
            ? campaignCountry.trim().toUpperCase() || null
            : null,
        min_gap_minutes: minGap,
      };

      const res = await fetch(`/api/send-policy/${campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        const message =
          typeof json.error === "string"
            ? json.error
            : json.error?.message ?? "Failed to save policy";
        toast({ title: "Unable to save", description: message, variant: "destructive" });
        return;
      }

      toast({ title: "Quiet hours saved", description: "Policy updated successfully." });
    } catch (err) {
      toast({
        title: "Unable to save",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium mb-2">Allowed days</div>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={days.includes(day.value)}
                onCheckedChange={() => toggleDay(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-sm font-medium mb-1">Start hour</div>
          <Select value={String(hourStart)} onValueChange={(v) => setHourStart(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h.toString().padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-sm font-medium mb-1">End hour</div>
          <Select value={String(hourEnd)} onValueChange={(v) => setHourEnd(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h.toString().padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div>
          <div className="text-sm font-medium">Block holidays</div>
          <div className="text-xs text-muted-foreground">
            Skips country-specific holidays for the lead.
          </div>
        </div>
        <Switch checked={blockHolidays} onCheckedChange={setBlockHolidays} />
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium">Timezone source</div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={tzSource === "lead"}
              onCheckedChange={() => setTzSource("lead")}
            />
            Lead
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={tzSource === "campaign"}
              onCheckedChange={() => setTzSource("campaign")}
            />
            Campaign override
          </label>
        </div>
        {tzSource === "campaign" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium mb-1">Campaign timezone</div>
              <Input
                value={campaignTz}
                onChange={(e) => setCampaignTz(e.target.value)}
                placeholder="America/New_York"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Country (ISO-2)</div>
              <Input
                value={campaignCountry}
                onChange={(e) => setCampaignCountry(e.target.value.toUpperCase())}
                placeholder="US"
                className="uppercase tracking-wide"
                maxLength={2}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-medium mb-1">Minimum gap between sends (minutes)</div>
        <Input
          type="number"
          min={0}
          max={1440}
          value={minGap}
          onChange={(e) => {
            const value = Number(e.target.value);
            setMinGap(Number.isNaN(value) ? 0 : value);
          }}
          className="w-32"
        />
      </div>

      <Button onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save quiet hours"}
      </Button>
    </div>
  );
}


