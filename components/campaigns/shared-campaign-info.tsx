"use client";

import * as React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SharedCampaignInfo({ campaignId }: { campaignId: string }) {
  const { data } = useSWR(`/api/campaigns/${campaignId}/members`, fetcher);

  const members = data?.members ?? [];
  const memberCount = members.length;

  if (memberCount === 0) {
    return null;
  }

  return (
    <p className="text-xs opacity-60">
      Shared with {memberCount} {memberCount === 1 ? "teammate" : "teammates"}
    </p>
  );
}










