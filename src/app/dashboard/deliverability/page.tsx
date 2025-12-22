"use client";

import { useState, useEffect } from "react";
import { 
  ChartBarIcon, 
  EnvelopeIcon, 
  GlobeAltIcon, 
  EyeIcon, 
  CursorArrowRaysIcon,
  FunnelIcon
} from "@heroicons/react/24/outline";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Block452DeliverabilityDashboard } from "@/components/dashboard/Block452DeliverabilityDashboard";

interface DeliverabilityData {
  mailboxes: {
    personal: any[];
    workspace: any[];
  };
  domains: {
    today: any[];
    last_7_days: any[];
  };
  engagement: {
    opens: number;
    clicks: number;
    total_recipients: number;
    open_rate: number;
    click_rate: number;
  };
  summary: {
    total_mailboxes: number;
    total_sent_today: number;
    top_domain_today: string | null;
    top_domain_week: string | null;
  };
}

interface Campaign {
  id: string;
  name: string;
}

interface WarmupAccount {
  id: string;
  provider: string;
  email_address: string | null;
}

interface WarmupSettingsRow {
  account_id: string;
  enabled: boolean;
  daily_limit: number;
  ramp_days: number;
  auto_reply: boolean;
  start_date: string;
  last_run: string | null;
}

interface WarmupMetricDaily {
  date: string;
  sent: number;
  opened: number;
  replied: number;
}

type WarmupUpdate = Partial<Pick<WarmupSettingsRow, "enabled" | "daily_limit" | "ramp_days" | "auto_reply">>;

export default function DeliverabilityPage() {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [campaignMeta, setCampaignMeta] = useState<any>(null);
  const sb = supabaseBrowser();
  const [warmAccounts, setWarmAccounts] = useState<WarmupAccount[]>([]);
  const [warmSettings, setWarmSettings] = useState<Record<string, WarmupSettingsRow | null>>({});
  const [loadingWarm, setLoadingWarm] = useState(true);
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(null);
  const [warmMetrics, setWarmMetrics] = useState<WarmupMetricDaily[]>([]);

  useEffect(() => {
    fetchDeliverabilityData();
    fetchCampaigns();
    loadWarm();
    loadWarmMetrics();
    if (selectedCampaign) {
      fetchCampaignMeta();
    } else {
      setCampaignMeta(null);
    }
  }, [refreshKey, selectedCampaign]);

  const fetchDeliverabilityData = async () => {
    try {
      const url = selectedCampaign 
        ? `/api/metrics/deliverability/overview?campaign_id=${selectedCampaign}`
        : "/api/metrics/deliverability/overview";
      
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Error fetching deliverability data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns/list");
      if (response.ok) {
        const result = await response.json();
        setCampaigns(result.campaigns || []);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    }
  };

  const fetchCampaignMeta = async () => {
    try {
      const response = await fetch("/api/campaigns/list");
      if (response.ok) {
        const result = await response.json();
        const campaign = (result.campaigns || []).find((c: any) => c.id === selectedCampaign);
        setCampaignMeta(campaign || null);
      }
    } catch (error) {
      console.error("Error fetching campaign meta:", error);
    }
  };

  const applyWarmPatch = (accountId: string, patch: WarmupUpdate) => {
    setWarmSettings((prev) => {
      const current: WarmupSettingsRow =
        prev[accountId] ??
        {
          account_id: accountId,
          enabled: false,
          daily_limit: 40,
          ramp_days: 14,
          auto_reply: true,
          start_date: new Date().toISOString().slice(0, 10),
          last_run: null,
        };
      return {
        ...prev,
        [accountId]: { ...current, ...patch },
      };
    });
  };

  const loadWarm = async () => {
    setLoadingWarm(true);
    try {
      const { data: accounts, error } = await sb
        .from("accounts")
        .select("id, provider, email_address, created_at")
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) {
        console.error("warmup accounts error", error);
        setWarmAccounts([]);
        setWarmSettings({});
        return;
      }

      const list = (accounts ?? []).map((row) => ({
        id: row.id,
        provider: row.provider ?? "",
        email_address: row.email_address ?? null,
      })) as WarmupAccount[];

      setWarmAccounts(list);

      const settingsEntries = await Promise.all(
        list.map(async (account) => {
          try {
            const resp = await fetch(`/api/account/${account.id}/warmup`);
            if (!resp.ok) {
              console.error("warmup fetch failed", await resp.text());
              return [account.id, null] as const;
            }
            const json = await resp.json();
            return [account.id, json.item ?? null] as const;
          } catch (err) {
            console.error("warmup fetch error", err);
            return [account.id, null] as const;
          }
        })
      );

      const map: Record<string, WarmupSettingsRow | null> = {};
      for (const [id, row] of settingsEntries) {
        map[id] = row;
      }
      setWarmSettings(map);
    } finally {
      setLoadingWarm(false);
    }
  };

  const loadWarmMetrics = async () => {
    const { data, error } = await sb
      .from("v_warmup_metrics")
      .select("d, sent, opened, replied")
      .order("d", { ascending: false })
      .limit(30);

    if (error) {
      console.error("warmup metrics error", error);
      setWarmMetrics([]);
      return;
    }

    const aggregated = new Map<string, { sent: number; opened: number; replied: number }>();

    for (const row of data ?? []) {
      const dayValue = row.d ? String(row.d).slice(0, 10) : null;
      if (!dayValue) continue;
      const current = aggregated.get(dayValue) ?? { sent: 0, opened: 0, replied: 0 };
      current.sent += row.sent ?? 0;
      current.opened += row.opened ?? 0;
      current.replied += row.replied ?? 0;
      aggregated.set(dayValue, current);
    }

    const latest = Array.from(aggregated.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 7);

    setWarmMetrics(latest);
  };

  const updateWarm = async (accountId: string, patch: WarmupUpdate) => {
    if (Object.keys(patch).length === 0) return;

    applyWarmPatch(accountId, patch);
    setUpdatingAccountId(accountId);

    try {
      const resp = await fetch(`/api/account/${accountId}/warmup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!resp.ok) {
        console.error("warmup update failed", await resp.text());
        await loadWarm();
        return;
      }

      const json = await resp.json();
      setWarmSettings((prev) => ({
        ...prev,
        [accountId]: json.item ?? prev[accountId] ?? null,
      }));
      await loadWarmMetrics();
    } catch (error) {
      console.error("warmup update error", error);
      await loadWarm();
    } finally {
      setUpdatingAccountId(null);
    }
  };

  const refreshData = () => {
    setRefreshKey((prev) => prev + 1);
    void loadWarm();
    void loadWarmMetrics();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Failed to load deliverability data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deliverability Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Monitor mailbox usage, domain performance, and engagement metrics
            </p>
          </div>
          <button
            onClick={refreshData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ChartBarIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Campaign Filter */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Filter by Campaign:</label>
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          {selectedCampaign && (
            <button
              onClick={() => setSelectedCampaign("")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {/* Campaign Status Warning */}
      {campaignMeta && campaignMeta.status !== "active" && (
        <div className="mb-6">
          <div className="text-xs rounded-md bg-amber-100 text-amber-900 px-3 py-2">
            Campaign is <b>{campaignMeta.status}</b>. New sends are blocked; dispatcher will skip these jobs.
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <EnvelopeIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Total Mailboxes</h3>
              <p className="text-2xl font-bold text-gray-900">{data.summary.total_mailboxes}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Sent Today</h3>
              <p className="text-2xl font-bold text-gray-900">{data.summary.total_sent_today}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <EyeIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Total Opens</h3>
              <p className="text-2xl font-bold text-gray-900">{data.engagement.opens}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CursorArrowRaysIcon className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Total Clicks</h3>
              <p className="text-2xl font-bold text-gray-900">{data.engagement.clicks}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg bg-white shadow p-6">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Smart Warm-Up</h3>
              <p className="text-sm text-gray-500">
                Gradually ramps up mailbox activity with friendly cross-account sends.
              </p>
            </div>
            <button
              onClick={() => {
                void loadWarm();
                void loadWarmMetrics();
              }}
              className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Reload
            </button>
          </header>

          <div className="mt-4 space-y-4">
            {loadingWarm ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
                Loading warm-up settings…
              </div>
            ) : warmAccounts.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
                No provider accounts connected yet. Link an inbox to enable warm-up.
              </div>
            ) : (
              warmAccounts.map((account) => {
                const warm = warmSettings[account.id];
                const disabled = updatingAccountId === account.id;
                const enabled = warm?.enabled ?? false;
                return (
                  <div key={account.id} className="rounded-2xl border p-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {account.email_address ?? account.id}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">
                          {account.provider || "account"}
                        </div>
                        {warm?.last_run && (
                          <div className="mt-1 text-xs text-gray-400">
                            Last run {new Date(warm.last_run).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => updateWarm(account.id, { enabled: e.target.checked })}
                          disabled={disabled}
                        />
                        Enabled
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Daily limit
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={warm?.daily_limit ?? 40}
                          disabled={disabled || !enabled}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10);
                            if (Number.isNaN(next)) return;
                            const clamped = Math.min(500, Math.max(1, next));
                            updateWarm(account.id, { daily_limit: clamped });
                          }}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Ramp days
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={warm?.ramp_days ?? 14}
                          disabled={disabled || !enabled}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10);
                            if (Number.isNaN(next)) return;
                            const clamped = Math.min(60, Math.max(1, next));
                            updateWarm(account.id, { ramp_days: clamped });
                          }}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={warm?.auto_reply ?? true}
                          disabled={disabled || !enabled}
                          onChange={(e) => updateWarm(account.id, { auto_reply: e.target.checked })}
                        />
                        Auto Reply
                      </label>
                    </div>

                    <div className="text-xs text-gray-500">
                      Gradually ramps up sends per day to protect deliverability.
                      <span className="ml-1">
                        Start date: {warm?.start_date ?? new Date().toISOString().slice(0, 10)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white shadow p-6">
          <h3 className="text-lg font-medium text-gray-900">Warm-Up Metrics</h3>
          <p className="text-sm text-gray-500">Daily counts across all participating accounts.</p>
          {warmMetrics.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-gray-500">
              No warm-up activity logged yet.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-md border">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Sent</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Opened</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Replied</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">%Open</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">%Reply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {warmMetrics.map((row) => {
                    const openRate = row.sent ? ((row.opened / row.sent) * 100).toFixed(0) : "0";
                    const replyRate = row.sent ? ((row.replied / row.sent) * 100).toFixed(0) : "0";
                    return (
                      <tr key={row.date}>
                        <td className="px-4 py-2 text-gray-900">{row.date}</td>
                        <td className="px-4 py-2 text-gray-700">{row.sent}</td>
                        <td className="px-4 py-2 text-gray-700">{row.opened}</td>
                        <td className="px-4 py-2 text-gray-700">{row.replied}</td>
                        <td className="px-4 py-2 text-gray-700">{openRate}%</td>
                        <td className="px-4 py-2 text-gray-700">{replyRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Mailbox Usage */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Mailbox Usage Today</h3>
          </div>
          <div className="p-6">
            {data.mailboxes.personal.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Personal Mailboxes</h4>
                <div className="space-y-3">
                  {data.mailboxes.personal.map((mailbox: any) => (
                    <div key={mailbox.id} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {mailbox.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {mailbox.from_email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">
                          {mailbox.used_today} / {mailbox.daily_cap}
                        </p>
                        <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              mailbox.used_today / mailbox.daily_cap > 0.8
                                ? 'bg-red-500'
                                : mailbox.used_today / mailbox.daily_cap > 0.6
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{
                              width: `${Math.min((mailbox.used_today / mailbox.daily_cap) * 100, 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {data.mailboxes.workspace.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Workspace Mailboxes</h4>
                <div className="space-y-3">
                  {data.mailboxes.workspace.map((mailbox: any) => (
                    <div key={mailbox.id} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {mailbox.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {mailbox.from_email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">
                          {mailbox.used_today} / {mailbox.daily_cap}
                        </p>
                        <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              mailbox.used_today / mailbox.daily_cap > 0.8
                                ? 'bg-red-500'
                                : mailbox.used_today / mailbox.daily_cap > 0.6
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{
                              width: `${Math.min((mailbox.used_today / mailbox.daily_cap) * 100, 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {data.mailboxes.personal.length === 0 && data.mailboxes.workspace.length === 0 && (
              <p className="text-gray-500 text-center py-4">No mailbox data available</p>
            )}
          </div>
        </div>

        {/* Top Domains */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Top Recipient Domains</h3>
          </div>
          <div className="p-6">
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Today</h4>
              {data.domains.today.length > 0 ? (
                <div className="space-y-2">
                  {data.domains.today.slice(0, 5).map((domain: any, index: number) => (
                    <div key={domain.domain} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900 w-6">
                          #{index + 1}
                        </span>
                        <GlobeAltIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">{domain.domain}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {domain.sent_count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No domain data for today</p>
              )}
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Last 7 Days</h4>
              {data.domains.last_7_days.length > 0 ? (
                <div className="space-y-2">
                  {data.domains.last_7_days.slice(0, 5).map((domain: any, index: number) => (
                    <div key={domain.domain} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900 w-6">
                          #{index + 1}
                        </span>
                        <GlobeAltIcon className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">{domain.domain}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {domain.sent_count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No domain data for last 7 days</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Block 452: Enhanced Deliverability Dashboard */}
      <div className="mt-8">
        <Block452DeliverabilityDashboard />
      </div>

      {/* Engagement Metrics */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Engagement Metrics</h3>
          {selectedCampaign && (
            <p className="text-sm text-gray-500 mt-1">
              Filtered by campaign: {campaigns.find(c => c.id === selectedCampaign)?.name}
            </p>
          )}
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{data.engagement.opens}</div>
              <div className="text-sm text-gray-500">Total Opens</div>
              {data.engagement.total_recipients > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  {((data.engagement.opens / data.engagement.total_recipients) * 100).toFixed(1)}% rate
                </div>
              )}
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{data.engagement.clicks}</div>
              <div className="text-sm text-gray-500">Total Clicks</div>
              {data.engagement.total_recipients > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  {((data.engagement.clicks / data.engagement.total_recipients) * 100).toFixed(1)}% rate
                </div>
              )}
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                {data.engagement.total_recipients || "N/A"}
              </div>
              <div className="text-sm text-gray-500">Total Recipients</div>
              <div className="text-xs text-gray-400 mt-1">
                {selectedCampaign ? "Campaign specific" : "All campaigns"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

