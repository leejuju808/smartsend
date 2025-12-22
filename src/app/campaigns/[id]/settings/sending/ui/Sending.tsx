"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type CampaignSendingPrefs = {
  campaign_id?: string;
  tz: string;
  window_start: string | null;
  window_end: string | null;
  business_days_only: boolean;
  allowed_weekdays: number[] | null;
  pace_per_hour: number;
  daily_cap: number | null;
  jitter_seconds: number;
  holidays_country?: string | null;
};

const DEFAULT_PREFS: CampaignSendingPrefs = {
  tz: "America/Los_Angeles",
  window_start: "09:00",
  window_end: "17:00",
  business_days_only: true,
  allowed_weekdays: null,
  pace_per_hour: 40,
  daily_cap: 250,
  jitter_seconds: 180,
  holidays_country: "US",
};

export default function Sending() {
  const { id: campaignId } = useParams() as { id: string };
  const sb = useMemo(supabaseBrowser, []);

  const [form, setForm] = useState<CampaignSendingPrefs>({
    ...DEFAULT_PREFS,
    campaign_id: campaignId,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!campaignId) return;
      const [prefsRes, campaignRes] = await Promise.all([
        sb
          .from<CampaignSendingPrefs>("campaign_sending_prefs")
          .select("*")
          .eq("campaign_id", campaignId)
          .maybeSingle(),
        sb
          .from("campaigns")
          .select("id, send_tz, window_start, window_end, business_days_only, holidays_country")
          .eq("id", campaignId)
          .maybeSingle(),
      ]);

      if (prefsRes.error) {
        console.error("Failed to load campaign sending prefs", prefsRes.error);
      }
      if (campaignRes.error) {
        console.error("Failed to load campaign row", campaignRes.error);
      }

      if (!active) return;

      const next: CampaignSendingPrefs = {
        ...DEFAULT_PREFS,
        ...(prefsRes.data ?? {}),
        campaign_id: campaignId,
      };

      const campaignRow = campaignRes.data as {
        send_tz?: string | null;
        window_start?: string | null;
        window_end?: string | null;
        business_days_only?: boolean | null;
        holidays_country?: string | null;
      } | null;

      if (campaignRow) {
        next.tz = campaignRow.send_tz ?? next.tz;
        next.window_start = campaignRow.window_start ?? next.window_start;
        next.window_end = campaignRow.window_end ?? next.window_end;
        next.business_days_only =
          campaignRow.business_days_only ?? next.business_days_only ?? true;
        next.holidays_country = campaignRow.holidays_country ?? next.holidays_country ?? "US";
      }

      setForm(next);
    })();
    return () => {
      active = false;
    };
  }, [sb, campaignId]);

  async function save() {
    if (!campaignId) return;
    setSaving(true);
    const payload = { ...form, campaign_id: campaignId };
    const holidaysCountry =
      (form.holidays_country ?? "")
        .trim()
        .toUpperCase() || null;
    const windowStart = form.window_start?.trim() ? form.window_start.trim() : null;
    const windowEnd = form.window_end?.trim() ? form.window_end.trim() : null;
    try {
      const prefsPayload: Record<string, any> = {
        ...payload,
        window_start: windowStart,
        window_end: windowEnd,
      };
      delete prefsPayload.holidays_country;

      const [{ error: prefsError }, { error: campaignError }] = await Promise.all([
        sb.from("campaign_sending_prefs").upsert(prefsPayload, { onConflict: "campaign_id" }),
        sb
          .from("campaigns")
          .update({
            send_tz: form.tz || null,
            window_start: windowStart,
            window_end: windowEnd,
            business_days_only: form.business_days_only,
            holidays_country: holidaysCountry,
          })
          .eq("id", campaignId),
      ]);

      if (prefsError) throw prefsError;
      if (campaignError) throw campaignError;

      setForm((prev) => ({
        ...prev,
        holidays_country: holidaysCountry ?? null,
        window_start: windowStart,
        window_end: windowEnd,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Sending Preferences</h2>
        <p className="text-sm opacity-70">
          Windows, timezone, pacing, and caps per campaign.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border p-4">
          <label className="block space-y-1">
            <span className="text-sm">Timezone (IANA)</span>
            <Input
              value={form.tz ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, tz: event.target.value }))}
              placeholder="America/Los_Angeles"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Start (HH:MM)</span>
              <Input
                value={form.window_start ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, window_start: event.target.value || null }))
                }
                placeholder="09:00"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">End (HH:MM)</span>
              <Input
                value={form.window_end ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, window_end: event.target.value || null }))
                }
                placeholder="17:00"
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={!!form.business_days_only}
              onCheckedChange={(value) =>
                setForm((prev) => ({ ...prev, business_days_only: value === true }))
              }
            />
            <span className="text-sm">Business days only (Mon–Fri)</span>
          </label>

          <label className="block space-y-1">
            <span className="text-sm">Holidays country (ISO alpha-2)</span>
            <Input
              value={form.holidays_country ?? ""}
              onChange={(event) => {
                const raw = event.target.value.toUpperCase();
                setForm((prev) => ({
                  ...prev,
                  holidays_country: raw.trim() === "" ? null : raw.slice(0, 2),
                }));
              }}
              placeholder="US"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Pace / hour</span>
              <Input
                type="number"
                min={1}
                value={form.pace_per_hour ?? 1}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setForm((prev) => ({ ...prev, pace_per_hour: Number.isFinite(value) && value > 0 ? value : 1 }));
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm">Daily cap</span>
              <Input
                type="number"
                min={0}
                value={form.daily_cap ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    daily_cap: raw === "" ? null : Number(raw) || 0,
                  }));
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm">Jitter (sec)</span>
              <Input
                type="number"
                min={0}
                value={form.jitter_seconds ?? 0}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    jitter_seconds: Number.isFinite(value) && value >= 0 ? value : 0,
                  }));
                }}
              />
            </label>
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}


