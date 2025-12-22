"use client";

import useSWR from "swr";

import { Badge } from "@/components/ui/badge";

type Props = {
  domain: string;
  accountId: string;
};

export function IspChip({ domain }: Props) {
  const { data } = useSWR(
    domain ? ["/api/resolve-isp", domain] : null,
    async ([url, d]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      return res.json();
    },
  );

  if (!data?.ok) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant="secondary">{data.isp}</Badge>
      <span className="opacity-70">{data.mx_host}</span>
    </div>
  );
}

