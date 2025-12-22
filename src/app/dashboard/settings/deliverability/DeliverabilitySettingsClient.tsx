"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/components/toast/ToastProvider";
import { Button } from "@/components/ui/Button";

type ConnectedAccount = {
  id: string;
  email?: string | null;
  provider?: string | null;
};

type AccountPrefs = {
  account_id: string;
  tz: string;
  window_start: string;
  window_end: string;
  business_days: number[];
  enforce_hours: boolean;
};

type WarmupRow = {
  domain: string;
  sent_count: number;
  daily_cap: number;
  warmup_level: number;
};

type CampaignRow = {
  id: string;
  name: string | null;
};

type CampaignSafetyRow = {
  campaign_id: string;
  paused: boolean;
  pause_reason: string | null;
  updated_at: string;
};

type TrackingDomain = {
  id: string;
  domain: string;
  verified: boolean;
  verification_token: string;
  last_checked_at: string | null;
  created_at: string;
};

const DEFAULT_PREFS: Omit<AccountPrefs, "account_id"> = {
  tz: "UTC",
  window_start: "08:00",
  window_end: "17:00",
  business_days: [1, 2, 3, 4, 5],
  enforce_hours: true,
};

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 7 },
];

export default function DeliverabilitySettingsClient() {
  const sb = supabaseBrowser();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trackingDomains, setTrackingDomains] = useState<TrackingDomain[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);

  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [prefs, setPrefs] = useState<AccountPrefs | null>(null);
  const [warmups, setWarmups] = useState<WarmupRow[]>([]);
  const [campaigns, setCampaigns] = useState<(CampaignRow & { safety?: CampaignSafetyRow | null })[]>([]);

  const loadDomains = async () => {
    const { data, error } = await sb
      .from("tracking_domains")
      .select("id, domain, verified, verification_token, last_checked_at, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("tracking_domains error", error);
      setTrackingDomains([]);
      return;
    }

    setTrackingDomains(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await sb.auth.getUser();
      if (!user?.id) {
        setTrackingDomains([]);
        setLoading(false);
        return;
      }

      await loadDomains();

      const { data: accounts, error: accountsError } = await sb
        .from("connected_accounts")
        .select("id, email, provider")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (accountsError) {
        console.error("connected_accounts error", accountsError);
        addToast({ variant: "error", title: "Failed to load accounts" });
        return;
      }

      const primary = accounts?.[0] ?? null;
      setAccount(primary ?? null);

      if (!primary?.id) {
        return;
      }

      const { data: prefRow, error: prefError } = await sb
        .from("account_sending_prefs")
        .select("*")
        .eq("account_id", primary.id)
        .maybeSingle();

      if (prefError) {
        console.error("account_sending_prefs error", prefError);
      }

      setPrefs({
        account_id: primary.id,
        ...(prefRow ?? { ...DEFAULT_PREFS, account_id: primary.id }),
        business_days: prefRow?.business_days ?? DEFAULT_PREFS.business_days,
        tz: prefRow?.tz ?? DEFAULT_PREFS.tz,
        window_start: prefRow?.window_start ?? DEFAULT_PREFS.window_start,
        window_end: prefRow?.window_end ?? DEFAULT_PREFS.window_end,
        enforce_hours: prefRow?.enforce_hours ?? DEFAULT_PREFS.enforce_hours,
      });

      const today = new Date().toISOString().slice(0, 10);
      const { data: warmData, error: warmError } = await sb
        .from("domain_warmup_state")
        .select("domain, sent_count, daily_cap, warmup_level")
        .eq("account_id", primary.id)
        .eq("day", today)
        .order("sent_count", { ascending: false })
        .limit(10);

      if (warmError) {
        console.error("domain_warmup_state error", warmError);
      } else {
        setWarmups(warmData ?? []);
      }

      const { data: campaignRows, error: campaignError } = await sb
        .from("campaigns")
        .select("id, name")
        .eq("from_account_id", primary.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (campaignError) {
        console.error("campaigns error", campaignError);
        return;
      }

      const campaignList = campaignRows ?? [];
      if (campaignList.length === 0) {
        setCampaigns([]);
        return;
      }

      const { data: safetyRows, error: safetyError } = await sb
        .from("campaign_safety")
        .select("campaign_id, paused, pause_reason, updated_at")
        .in(
          "campaign_id",
          campaignList.map((c) => c.id)
        );

      if (safetyError) {
        console.error("campaign_safety error", safetyError);
      }

      const safetyMap = new Map<string, CampaignSafetyRow>();
      safetyRows?.forEach((row) => safetyMap.set(row.campaign_id, row));

      setCampaigns(
        campaignList.map((c) => ({
          ...c,
          safety: safetyMap.get(c.id),
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    if (!prefs) return;
    const exists = prefs.business_days.includes(day);
    const next = exists
      ? prefs.business_days.filter((d) => d !== day)
      : [...prefs.business_days, day].sort((a, b) => a - b);
    setPrefs({ ...prefs, business_days: next });
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const { error } = await sb.from("account_sending_prefs").upsert({
        account_id: prefs.account_id,
        tz: prefs.tz,
        window_start: prefs.window_start,
        window_end: prefs.window_end,
        business_days: prefs.business_days,
        enforce_hours: prefs.enforce_hours,
      });

      if (error) {
        console.error("account_sending_prefs upsert error", error);
        addToast({ variant: "error", title: "Failed to save account hours" });
        return;
      }

      addToast({ variant: "success", title: "Account hours updated" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDomain = async () => {
    const value = domainInput.trim();
    if (!value) {
      return;
    }

    setAddingDomain(true);
    try {
      const response = await fetch("/api/tracking-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: value }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const fieldErrors = data?.error?.fieldErrors
          ? Object.values<Record<string, string[]>>(data.error.fieldErrors).flat()
          : [];
        const formErrors = Array.isArray(data?.error?.formErrors)
          ? data.error.formErrors
          : [];
        const errorMessage =
          typeof data?.error === "string"
            ? data.error
            : [...formErrors, ...fieldErrors].filter(Boolean).join(", ") ||
              "Failed to add tracking domain";

        addToast({ variant: "error", title: errorMessage });
        return;
      }

      await loadDomains();
      setDomainInput("");

      const token = data?.item?.verification_token;
      const message = token
        ? `Added! Now add TXT record: smartsend-verification=${token}`
        : "Added! Now add TXT record: smartsend-verification=<token>";

      if (typeof window !== "undefined") {
        window.alert(message);
      }
    } catch (error) {
      console.error("add tracking domain error", error);
      addToast({ variant: "error", title: "Failed to add tracking domain" });
    } finally {
      setAddingDomain(false);
    }
  };

  const handleVerifyDomain = async (domain: string) => {
    const fnUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!fnUrl) {
      addToast({ variant: "error", title: "NEXT_PUBLIC_SUPABASE_URL is not set" });
      return;
    }

    setVerifyingDomain(domain);
    try {
      const response = await fetch(
        `${fnUrl}/functions/v1/verify-tracking-domain?domain=${encodeURIComponent(domain)}`,
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof data?.error === "string" && data.error
            ? data.error
            : "Verification failed";
        addToast({ variant: "error", title: message });
        return;
      }

      await loadDomains();
      const verified = Boolean(data?.verified);
      const message = verified
        ? "✅ Verified!"
        : "❌ Not yet, wait for DNS";

      if (typeof window !== "undefined") {
        window.alert(message);
      }
    } catch (error) {
      console.error("verify tracking domain error", error);
      addToast({ variant: "error", title: "Verification failed" });
    } finally {
      setVerifyingDomain(null);
    }
  };

  const resumeCampaign = async (campaignId: string) => {
    const { error } = await sb.rpc("resume_campaign", { p_campaign: campaignId });
    if (error) {
      console.error("resume_campaign error", error);
      addToast({ variant: "error", title: "Failed to resume campaign" });
    } else {
      addToast({ variant: "success", title: "Campaign resumed" });
      load();
    }
  };

  const pausedCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) => c.safety?.paused && c.safety.pause_reason === "bounce_rate"
      ),
    [campaigns]
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading deliverability controls…</div>;
  }

  if (!account) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Connect a mailbox to configure deliverability settings.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Custom Tracking Domain</h2>
            <p className="text-sm text-muted-foreground">
              Route opens and clicks through your brand domain.
            </p>
          </div>

          <input
            placeholder="trk.smartsendhq.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <Button
            onClick={handleAddDomain}
            disabled={addingDomain || !domainInput.trim()}
            size="sm"
          >
            {addingDomain ? "Adding…" : "Add Domain"}
          </Button>

          <div className="text-xs text-muted-foreground mt-2">
            Add a TXT record:
            <br />
            <code>smartsend-verification=&lt;token&gt;</code> on your domain’s DNS.
            <br />
            Then click “Verify” after propagation.
          </div>

          {trackingDomains.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              No tracking domains yet.
            </div>
          ) : (
            <div className="space-y-3">
              {trackingDomains.map((row) => {
                const verifying = verifyingDomain === row.domain;
                const statusClasses = row.verified
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700";

                return (
                  <div
                    key={row.id}
                    className="rounded-md border px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">{row.domain}</div>
                        <div className="text-xs text-muted-foreground">
                          Token:{" "}
                          <code>smartsend-verification={row.verification_token}</code>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Last checked:{" "}
                          {row.last_checked_at
                            ? new Date(row.last_checked_at).toLocaleString()
                            : "Never"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses}`}>
                          {row.verified ? "Verified" : "Pending"}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleVerifyDomain(row.domain)}
                          disabled={
                            verifying ||
                            (verifyingDomain !== null &&
                              verifyingDomain !== row.domain)
                          }
                        >
                          {verifying ? "Verifying…" : "Verify"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Account Hours</h2>
            <p className="text-sm text-muted-foreground">
              Restrict outbound sends to business hours for {account.email ?? "this mailbox"}.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs?.enforce_hours ?? false}
              onChange={(e) => prefs && setPrefs({ ...prefs, enforce_hours: e.target.checked })}
            />
            Enforce hours
          </label>
        </header>

        {prefs?.enforce_hours && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                Timezone
              </label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={prefs.tz}
                onChange={(e) => setPrefs({ ...prefs, tz: e.target.value })}
              >
                {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Singapore"].map(
                  (tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  )
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Window start
                </label>
                <input
                  type="time"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={prefs.window_start}
                  onChange={(e) => setPrefs({ ...prefs, window_start: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Window end
                </label>
                <input
                  type="time"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={prefs.window_end}
                  onChange={(e) => setPrefs({ ...prefs, window_end: e.target.value })}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                Business days
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-md px-3 py-1 text-sm ${
                      prefs.business_days.includes(day.value)
                        ? "border border-blue-500 bg-blue-50 text-blue-700"
                        : "border border-gray-200 text-gray-600"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          className="mt-6 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          onClick={savePrefs}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save hours"}
        </button>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Domain Warmup</h2>
            <p className="text-sm text-muted-foreground">
              Top domains for today ({new Date().toLocaleDateString()}).
            </p>
          </div>
        </header>
        {warmups.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No sends logged today.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Domain</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Sent</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Daily cap</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Warmup level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {warmups.map((row) => (
                  <tr key={row.domain}>
                    <td className="px-4 py-2 font-medium text-gray-900">{row.domain}</td>
                    <td className="px-4 py-2 text-gray-700">{row.sent_count}</td>
                    <td className="px-4 py-2 text-gray-700">{row.daily_cap}</td>
                    <td className="px-4 py-2 text-gray-700">{row.warmup_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Campaign Safety</h2>
            <p className="text-sm text-muted-foreground">
              Auto-pauses triggered by bounce rate monitors.
            </p>
          </div>
        </header>
        {pausedCampaigns.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-green-700 bg-green-50">
            No campaigns are paused for bounce rate right now.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {pausedCampaigns.map((camp) => (
              <div
                key={camp.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-red-800">
                    {camp.name ?? "Untitled campaign"}
                  </div>
                  <div className="text-xs text-red-600">
                    Paused {new Date(camp.safety!.updated_at).toLocaleString()} · reason:{" "}
                    {camp.safety!.pause_reason}
                  </div>
                </div>
                <button
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  onClick={() => resumeCampaign(camp.id)}
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}