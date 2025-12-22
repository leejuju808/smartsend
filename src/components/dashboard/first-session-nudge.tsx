"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

type Props = {
  isLive: boolean;
  hasCampaigns: boolean;
  hasLeads: boolean;
  workspaceName?: string | null;
};

export function DashboardFirstSessionNudge({
  isLive,
  hasCampaigns,
  hasLeads,
  workspaceName,
}: Props) {
  // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
  if (!isCoachingUIEnabled()) return null;

  const router = useRouter();

  // Only show the big nudge if onboarding is finished and no campaigns yet
  if (!isLive || hasCampaigns) {
    return null;
  }

  const title = workspaceName
    ? `Welcome to ${workspaceName}`
    : "Welcome to SmartSend";

  return (
    <section className="border rounded-2xl p-4 md:p-5 bg-gradient-to-r from-background via-background to-muted/70 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            First session
          </p>
          <h1 className="text-base md:text-lg font-semibold">{title}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            System is live. Start outreach and replies land here automatically.
          </p>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-2">
          <Button
            size="sm"
            className="w-full md:w-auto"
            onClick={() => router.push("/campaigns/new")}
          >
            Start outreach
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <NudgeCard
          label="1. Select homeowner list"
          body={
            hasLeads
              ? "Use the homeowners you already imported or choose a segment."
              : "Import homeowners from CSV or paste from your system."
          }
          linkLabel={hasLeads ? "View homeowners" : "Import homeowners"}
          href={hasLeads ? "/leads" : "/leads/import"}
        />
        <NudgeCard
          label="2. Write the sequence"
          body="Short sequence. Clear offer. Daily cap."
          linkLabel="Open outreach builder"
          href="/campaigns/new"
        />
        <NudgeCard
          label="3. Go live safely"
          body="Set daily caps and sending windows so you warm up steadily and avoid spam filters."
          linkLabel="Review sending settings"
          href="/settings/sending"
        />
      </div>
    </section>
  );
}

function NudgeCard({
  label,
  body,
  linkLabel,
  href,
}: {
  label: string;
  body: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <div className="border rounded-xl p-3 bg-card/60 flex flex-col justify-between gap-2">
      <div className="space-y-1">
        <p className="text-[0.7rem] font-semibold">{label}</p>
        <p className="text-[0.7rem] text-muted-foreground">{body}</p>
      </div>
      <a
        href={href}
        className={cn(
          "inline-flex items-center text-[0.7rem] mt-1 text-primary hover:underline"
        )}
      >
        {linkLabel} →
      </a>
    </div>
  );
}










