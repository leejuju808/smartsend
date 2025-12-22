"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBilling } from "@/lib/useBilling";

function NewCampaignButton() {
  const router = useRouter();
  const { data } = useBilling();
  const atLimit = data ? data.campaigns_used >= data.campaigns_max : false;

  const Btn = (
    <Button disabled={atLimit} onClick={() => (!atLimit ? router.push("/dashboard/campaigns/new") : undefined)}>
      New Outreach
    </Button>
  );

  if (!atLimit) return Btn;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{Btn}</TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            Outreach capacity reached ({data?.campaigns_used}/{data?.campaigns_max}).
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function CampaignsPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/campaigns/list", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!mounted) return;
        setData(j);
      } catch {
        if (!mounted) return;
        setData({ campaigns: [] });
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const campaigns = useMemo(() => data?.campaigns || [], [data]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Outreach</h1>
        <NewCampaignButton />
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <div className="text-gray-500">No outreach configured</div>
          <div className="flex justify-center">
            <NewCampaignButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c: any) => (
            <Link
              key={c.campaign_id}
              href={`/campaigns/${c.campaign_id}`}
              className="block border rounded-xl p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-lg">{c.name}</div>
                  <div className="text-sm text-gray-600">Created {new Date(c.created_at).toLocaleString()}</div>
                </div>
                <div className="text-sm text-right">
                  <div className="mb-1">
                    <span className="text-gray-600">Sent:</span>
                    <span className="font-semibold ml-1">{c.sent_jobs ?? 0}</span>
                  </div>
                  <div className="mb-1">
                    <span className="text-gray-600">Unique opens:</span>
                    <span className="font-semibold ml-1">{c.unique_opens}</span>
                    <span className="text-green-600 ml-1">({c.open_rate_pct}% OR)</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Unique clicks:</span>
                    <span className="font-semibold ml-1">{c.unique_clicks}</span>
                    <span className="text-blue-600 ml-1">({c.click_rate_pct}% CTR)</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}