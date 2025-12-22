"use client";

import { useState } from "react";
import { useBillingPlans } from "@/lib/hooks/useBillingPlans";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function PlansDialog() {
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useBillingPlans();

  const plans = data?.plans || [];

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      reload();
    }
  };

  // simple highlight: pick plan with highest daily_send_cap as "Best value"
  const maxSendCap = plans.reduce(
    (max, p) => Math.max(max, p.daily_send_cap || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-[11px]"
        >
          View plans
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Compare plans
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            See how daily send caps, reply caps, and seats change across
            SmartSend plans. Billing changes are managed via the Stripe
            portal.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3">
          {loading && (
            <p className="text-[11px] text-muted-foreground">
              Loading plans…
            </p>
          )}
          {!loading && plans.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No active plans configured yet.
            </p>
          )}
          {!loading && plans.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-950/80">
                  <tr>
                    <th className="px-3 py-2 font-medium w-[26%]">
                      Plan
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Sends / day
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Replies / day
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Seats
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => {
                    const isBest = p.daily_send_cap === maxSendCap && maxSendCap > 0;
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-slate-800 hover:bg-slate-950/80"
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs">
                                {p.name}
                              </span>
                              {p.id === "free" && (
                                <Badge className="bg-slate-900/80 border-slate-600 text-[9px]">
                                  Free
                                </Badge>
                              )}
                              {isBest && p.id !== "free" && (
                                <Badge className="bg-amber-900/80 border-amber-600 text-[9px] inline-flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  Best value
                                </Badge>
                              )}
                            </div>
                            {p.description && (
                              <span className="text-[10px] text-muted-foreground">
                                {p.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          {p.daily_send_cap ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          {p.daily_reply_cap ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          {p.seat_limit ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <span className="text-[10px] text-muted-foreground">
                            Managed via billing portal
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}





