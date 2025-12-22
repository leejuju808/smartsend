"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DuplicateCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className="inline-flex items-center gap-1"
      onClick={() => {
        startTransition(async () => {
          try {
            const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
              method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.id) {
              toast.error(json?.error || "Failed to duplicate campaign");
              return;
            }
            toast.success("Campaign duplicated");
            router.push(json.next || `/campaigns/${json.id}`);
            router.refresh();
          } catch (e: any) {
            toast.error(e?.message || "Failed to duplicate campaign");
          }
        });
      }}
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Duplicating…
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Duplicate
        </>
      )}
    </Button>
  );
}








