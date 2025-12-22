"use client";

import * as React from "react";
import { launchCampaign } from "@/app/api/campaign/[id]/launch/actions";
import { Button } from "@/components/ui/button";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { usePreflightCheck } from "@/lib/hooks/usePreflightCheck";

interface CampaignLaunchButtonProps {
  campaignId: string;
  segmentId: string | null;
}

export function CampaignLaunchButton({
  campaignId,
  segmentId,
}: CampaignLaunchButtonProps) {
  const [pending, startTransition] = React.useTransition();
  const { ok: preflightOk, loading: preflightLoading } = usePreflightCheck(campaignId);

  const disabled = pending || !segmentId || !preflightOk || preflightLoading;

  async function handleLaunch() {
    if (!segmentId) {
      toast.error("Attach a segment before launching this campaign.");
      return;
    }
    
    if (!preflightOk) {
      toast.error("Preflight checks failed. Please fix errors before launching.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await launchCampaign(campaignId);

        if (!result.ok) {
          toast.error("Launch failed");
          return;
        }

        const parts: string[] = [];
        parts.push(`Enqueued ${result.enqueued} lead(s).`);
        if (result.skipped_no_email > 0) {
          parts.push(`${result.skipped_no_email} without email.`);
        }
        if (result.skipped_unreachable > 0) {
          parts.push(`${result.skipped_unreachable} unsubscribed/bounced.`);
        }
        if (result.skipped_existing > 0) {
          parts.push(`${result.skipped_existing} already had sends.`);
        }

        toast.success(parts.join(" "));
      } catch (err) {
        console.error(err);
        toast.error("Failed to launch campaign");
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleLaunch}
      disabled={disabled}
      className="inline-flex items-center gap-1"
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Launching…
        </>
      ) : (
        <>
          <Rocket className="h-3 w-3" />
          Launch campaign
        </>
      )}
    </Button>
  );
}


