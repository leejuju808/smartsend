"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type AllowanceResponse = {
  account_id: string;
  capacity: number;
  refill_per_sec: number;
  tokens: number;
  allowance_next_hour: number;
  updated_at?: string;
  error?: string;
};

export function SendAllowanceChip({ accountId, label }: { accountId: string; label?: string }) {
  const { data } = useSWR<AllowanceResponse>(
    `/api/accounts/${accountId}/allowance`,
    fetcher,
    { refreshInterval: 15_000 }
  );

  if (!data || data.error) {
    return null;
  }

  const perHour = Math.round((data.refill_per_sec ?? 0) * 3600);
  const text = `${data.allowance_next_hour}/${data.capacity} next hr`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary">
            {label ? `${label}: ` : ""}
            {text}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div>Capacity: {data.capacity}</div>
            <div>Tokens now: {Math.floor(data.tokens)}</div>
            <div>Refill: ~{perHour}/hr</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



