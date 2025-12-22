"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  status: string | null;
  statusReason?: string | null;
};

export function CampaignQuotaBanner({ status, statusReason }: Props) {
  if (status !== "paused_quota") return null;

  return (
    <Card className="mb-3 border border-red-700/70 bg-red-950/60 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-[2px] text-red-300" />
          <div className="space-y-0.5">
            <div className="font-semibold text-[11px]">
              Campaign paused by quota
            </div>
            <div className="text-[11px] text-red-100/90">
              {statusReason ??
                "SmartSend paused this campaign because your workspace hit its send or reply limits."}
            </div>
            <div className="text-[10px] text-red-200/80">
              Upgrade your plan or wait for your quota window to reset. Once your
              workspace is back within limits, you can resume sending from this
              campaign.
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <Link href="/dashboard/billing">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
            >
              View usage
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

