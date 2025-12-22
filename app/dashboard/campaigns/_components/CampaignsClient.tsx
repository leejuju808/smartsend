// app/dashboard/campaigns/_components/CampaignsClient.tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UpgradeModal } from "@/components/UpgradeModal";
import type { PlanKey } from "@/lib/planConfig";

type CampaignRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  from_name: string | null;
  from_email: string | null;
  daily_send_limit: number | null;
};

interface Props {
  campaigns: CampaignRow[];
}

type NewCampaignForm = {
  name: string;
  description: string;
  fromName: string;
  fromEmail: string;
  dailySendLimit: string;
};

function formatTimeAgo(dateString: string): string {
  const d = new Date(dateString);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return dateString;

  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (!Number.isFinite(mins) || mins < 0) return d.toLocaleDateString();
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;

  return d.toLocaleDateString();
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide";
  if (status === "active") {
    return `${base} border-emerald-600 bg-emerald-500/10 text-emerald-700`;
  }
  if (status === "paused") {
    return `${base} border-yellow-500 bg-yellow-500/10 text-yellow-700`;
  }
  if (status === "archived") {
    return `${base} border-gray-500 bg-gray-500/10 text-gray-400`;
  }
  return `${base} border-blue-600 bg-blue-500/10 text-blue-700`;
}

export default function CampaignsClient({ campaigns }: Props) {
  const router = useRouter();
  const [isCreating, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [planTier, setPlanTier] = useState<PlanKey>("starter");
  const [planLimits, setPlanLimits] = useState<any>(null);
  const [form, setForm] = useState<NewCampaignForm>({
    name: "",
    description: "",
    fromName: "",
    fromEmail: "",
    dailySendLimit: "50",
  });

  // Fetch plan limits on mount
  useEffect(() => {
    fetch("/api/plan/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.plan_tier) {
          setPlanTier(data.plan_tier);
          setPlanLimits(data.limits);
        }
      })
      .catch((err) => console.error("Failed to fetch plan limits:", err));
  }, []);

  function updateField<K extends keyof NewCampaignForm>(
    key: K,
    value: NewCampaignForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!form.name.trim()) return;

    // Guardrail A: Check campaign limit before creating
    if (planLimits) {
      const currentCount = campaigns.length;
      const maxCampaigns = planLimits.max_campaigns === Infinity 
        ? Infinity 
        : planLimits.max_campaigns;
      
      if (maxCampaigns !== Infinity && currentCount >= maxCampaigns) {
        setShowUpgrade(true);
        return;
      }
    }

    startTransition(async () => {
      try {
        const body = {
          name: form.name.trim(),
          description: form.description.trim() || null,
          fromName: form.fromName.trim() || null,
          fromEmail: form.fromEmail.trim() || null,
          dailySendLimit:
            form.dailySendLimit.trim() === ""
              ? null
              : Number.parseInt(form.dailySendLimit, 10) || 50,
        };

        const res = await fetch("/api/campaigns/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorText = await res.text();
          const errorData = JSON.parse(errorText).catch(() => ({}));
          
          // Check if it's a campaign limit error
          if (res.status === 402 || errorData.error === "campaign_limit_reached") {
            setShowUpgrade(true);
            return;
          }
          
          console.error("Failed to create campaign", errorText);
          return;
        }

        const json = await res.json();

        // Reset + refresh
        setShowNew(false);
        setForm({
          name: "",
          description: "",
          fromName: "",
          fromEmail: "",
          dailySendLimit: "50",
        });

        // Optional: jump into campaign detail
        if (json.campaignId) {
          router.push(`/dashboard/campaigns/${json.campaignId}`);
        } else {
          router.refresh();
        }
      } catch (err) {
        console.error("Error creating campaign", err);
      }
    });
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            City outreach
          </h1>
          <p className="text-sm text-muted-foreground">
            Each city outreach reaches homeowners in one city every day.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="rounded-full bg-primary px-4 py-[6px] text-xs font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow"
        >
          New city outreach
        </button>
      </header>

      <section className="relative flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Your city outreach</h2>
          <span className="text-xs text-muted-foreground">
            {campaigns.length} total
          </span>
        </div>

        <div className="h-[calc(100vh-260px)] overflow-y-auto">
          {campaigns.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <p className="text-sm text-muted-foreground">
                No city outreach yet. Create your first city outreach to start
                controlling how jobs enter the business.
              </p>
            </div>
          ) : (
            <div className="min-w-full text-sm">
              <div className="grid grid-cols-5 gap-2 border-b px-4 py-2 text-[11px] font-medium text-muted-foreground">
                <div className="col-span-2">City outreach</div>
                <div>Sender</div>
                <div>Daily cap</div>
                <div className="text-right">Created</div>
              </div>

              <div className="divide-y">
                {campaigns.map((c) => (
                  <article
                    key={c.id}
                    className="grid grid-cols-5 gap-2 px-4 py-2 text-xs hover:bg-muted/60"
                  >
                    {/* Campaign name + status */}
                    <div className="col-span-2 flex flex-col gap-[2px]">
                      <Link
                        href={`/dashboard/campaigns/${c.id}`}
                        className="text-xs font-medium underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={statusBadge(c.status)}>
                          {c.status}
                        </span>
                        {c.description && (
                          <span className="line-clamp-1 text-[10px] text-muted-foreground">
                            {c.description}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/dashboard/campaigns/${c.id}/sequence`}
                        className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Follow-up plan
                      </Link>
                    </div>

                    {/* From */}
                    <div className="flex flex-col gap-[2px] text-[11px]">
                      {c.from_name && (
                        <span className="font-medium">{c.from_name}</span>
                      )}
                      {c.from_email && (
                        <span className="text-[10px] text-muted-foreground">
                          {c.from_email}
                        </span>
                      )}
                      {!c.from_name && !c.from_email && (
                        <span className="text-[10px] text-muted-foreground">
                          Not set
                        </span>
                      )}
                    </div>

                    {/* Daily cap */}
                    <div className="flex items-center text-[11px] text-muted-foreground">
                      {c.daily_send_limit ?? 50} / day
                    </div>

                    {/* Created */}
                    <div className="flex items-center justify-end text-[11px] text-muted-foreground">
                      {formatTimeAgo(c.created_at)}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* New City Outreach Drawer */}
        {showNew && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  New city outreach
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Start with a clear name and sender identity. You can add the
                follow-up plan after.
              </p>

              <div className="mt-4 flex flex-col gap-3 text-xs">
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium">
                    City outreach name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                    placeholder="e.g. Lacey – Roof Replacement – Winter Promo"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    disabled={isCreating}
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium">
                    Description (optional)
                  </label>
                  <textarea
                    className="min-h-[80px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                    placeholder="Internal note about who this campaign targets and what the offer is."
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    disabled={isCreating}
                  />
                </div>

                {/* From name / email */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">
                      From name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      placeholder="e.g. Julian from Apex Roofing"
                      value={form.fromName}
                      onChange={(e) => updateField("fromName", e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium">
                      Sender address
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                      placeholder="e.g. julian@yourroofingco.com"
                      value={form.fromEmail}
                      onChange={(e) => updateField("fromEmail", e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                </div>

                {/* Daily send limit */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium">
                    Daily contact limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    step={10}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                    placeholder="50"
                    value={form.dailySendLimit}
                    onChange={(e) =>
                      updateField("dailySendLimit", e.target.value)
                    }
                    disabled={isCreating}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    How many homeowners this city outreach is allowed to contact per day.
                  </span>
                </div>

              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
                <span className="text-[10px] text-muted-foreground">
                  You can plug in your roofing sequences after this step.
                </span>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || !form.name.trim()}
                  className="rounded-full bg-primary px-4 py-[6px] text-[11px] font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? "Creating…" : "Create city outreach"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="campaign_limit"
        message={
          planLimits
            ? `Your ${planTier} plan allows ${planLimits.max_campaigns === Infinity ? "more" : planLimits.max_campaigns} active city outreach run(s). Upgrade to create more.`
            : "You've reached your city outreach limit. Upgrade to create more."
        }
      />
    </div>
  );
}

