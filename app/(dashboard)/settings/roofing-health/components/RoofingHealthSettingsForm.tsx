"use client";

import React, { useState } from "react";
import type { RoofingHealthSettings } from "../_lib/notificationSettings";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { saveRoofingHealthSettings } from "../_lib/notificationSettings";

type Props = {
  orgId: string;
  initialSettings: RoofingHealthSettings;
};

export const RoofingHealthSettingsForm: React.FC<Props> = ({
  orgId,
  initialSettings,
}) => {
  const supabase = createBrowserClient();

  const [values, setValues] = useState<RoofingHealthSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update<K extends keyof RoofingHealthSettings>(
    key: K,
    value: RoofingHealthSettings[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // basic guard: warm threshold can't be >= hot threshold
      if (values.warm_threshold >= values.hot_threshold) {
        setMessage("Warm threshold must be lower than hot threshold.");
        setSaving(false);
        return;
      }

      await saveRoofingHealthSettings(supabase, orgId, values);
      setMessage("Settings saved.");
    } catch (err) {
      console.error(err);
      setMessage("Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Weekly Hot Jobs Email
        </p>
        <label className="flex items-center gap-2 text-xs text-zinc-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
            checked={values.weekly_hot_jobs_enabled}
            onChange={(e) => update("weekly_hot_jobs_enabled", e.target.checked)}
          />
          Send me a weekly summary of my HOT roofing jobs
        </label>
        <div className="mt-2 space-y-1 text-xs text-zinc-400">
          <label className="block text-[11px] font-medium text-zinc-400">
            Send to email
          </label>
          <input
            type="email"
            placeholder="owner@yourroofingcompany.com"
            value={values.weekly_hot_jobs_email ?? ""}
            onChange={(e) =>
              update(
                "weekly_hot_jobs_email",
                e.target.value.trim() || null
              )
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          />
          <p className="text-[11px]">
            Leave blank to send to your account owner email.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Score Thresholds
        </p>
        <p className="text-[11px] text-zinc-400">
          Choose how SmartSend labels your jobs:
          <br />
          HOT, WARM, and COLD. This changes the dashboard, filters, and reports.
        </p>

        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400">
              HOT starts at
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={values.hot_threshold}
              onChange={(e) =>
                update("hot_threshold", Number(e.target.value || 0))
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
            />
            <p className="mt-1 text-[11px] text-zinc-500">Recommended: 75</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400">
              WARM starts at
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={values.warm_threshold}
              onChange={(e) =>
                update("warm_threshold", Number(e.target.value || 0))
              }
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
            />
            <p className="mt-1 text-[11px] text-zinc-500">Recommended: 40</p>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">
          Jobs below the warm threshold are treated as COLD.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Fast Estimate Booking Link
        </p>
        <p className="text-[11px] text-zinc-400">
          Drop in your online booking link (Calendly, website form, etc.). SmartSend will
          include it in AI replies so homeowners can book estimates in one click.
        </p>
        <input
          type="url"
          placeholder="https://yourroofingcompany.com/book-estimate"
          value={values.fast_estimate_url ?? ""}
          onChange={(e) =>
            update("fast_estimate_url", e.target.value.trim() || null)
          }
          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Weekly CSV Attachment
        </p>
        <label className="flex items-center gap-2 text-xs text-zinc-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
            checked={values.include_weekly_csv}
            onChange={(e) =>
              update("include_weekly_csv", e.target.checked)
            }
          />
          Attach a CSV of HOT jobs to the weekly email
        </label>
        <p className="text-[11px] text-zinc-400">
          Great if you like to share call lists with your office or sales team.
        </p>
      </div>

      {message && (
        <p className="text-xs text-zinc-400">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center rounded-xl bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </form>
  );
};

