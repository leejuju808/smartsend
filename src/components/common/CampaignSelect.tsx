"use client";

import * as React from "react";
import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Campaign = {
  id: string;
  name?: string | null;
};

const STORAGE_KEY = "preferred_campaign_id";

export function CampaignSelect({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const { data } = useSWR<{ campaigns?: Campaign[] }>(
    "/api/campaigns/list",
    fetcher,
    { refreshInterval: 30_000 }
  );

  const campaigns = data?.campaigns ?? [];
  const current = params.get("campaign_id") ?? "";

  const setCampaign = React.useCallback(
    (id: string) => {
      const sp = new URLSearchParams(params.toString());
      if (!id) {
        sp.delete("campaign_id");
      } else {
        sp.set("campaign_id", id);
      }

      if (typeof window !== "undefined") {
        if (id) {
          window.localStorage.setItem(STORAGE_KEY, id);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      const query = sp.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [params, pathname, router]
  );

  // Prefill from localStorage on first load if URL does not define it yet.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (current) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCampaign(stored);
    }
  }, [current, setCampaign]);

  return (
    <div className={className}>
      <Select value={current} onValueChange={setCampaign}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="All campaigns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All campaigns</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name || campaign.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}




