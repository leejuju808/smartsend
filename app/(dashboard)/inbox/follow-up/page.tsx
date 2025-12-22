"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FollowUpPage() {
  const { data, mutate } = useSWR("/api/inbox/follow-up/list", fetcher);
  const items = data?.items ?? [];

  async function markComplete(id: string) {
    await fetch("/api/inbox/follow-up/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_lead_id: id }),
    });
    mutate();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Follow-Up Later</h1>
      <p className="text-sm text-muted-foreground">
        Leads who replied but asked for a later follow-up. Sorted by due date.
      </p>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Lead</th>
              <th className="px-4 py-2 text-left">Campaign</th>
              <th className="px-4 py-2 text-left">Next Follow-Up</th>
              <th className="px-4 py-2 text-left">Notes</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item: any) => {
              const lead = item.leads;
              const campaign = item.campaigns;

              const isOverdue =
                item.follow_up_at &&
                !item.follow_up_completed &&
                new Date(item.follow_up_at) < new Date();
              const isDueToday =
                item.follow_up_at &&
                !item.follow_up_completed &&
                new Date(item.follow_up_at).toDateString() === new Date().toDateString();

              return (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {lead?.first_name || lead?.last_name
                        ? `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim()
                        : lead?.email}
                    </div>
                    <div className="text-xs text-muted-foreground">{lead?.email}</div>
                  </td>

                  <td className="px-4 py-2 text-xs">{campaign?.name || "—"}</td>

                  <td className="px-4 py-2 text-xs">
                    {item.follow_up_at ? (
                      <div>
                        <div>{format(new Date(item.follow_up_at), "PPP p")}</div>
                        {isOverdue && (
                          <div className="text-red-600 font-medium">Overdue</div>
                        )}
                        {isDueToday && !isOverdue && (
                          <div className="text-orange-600 font-medium">Due Today</div>
                        )}
                      </div>
                    ) : (
                      "Not scheduled"
                    )}
                  </td>

                  <td className="px-4 py-2 text-xs">{item.follow_up_notes || "—"}</td>

                  <td className="px-4 py-2 text-right">
                    <Button size="sm" onClick={() => markComplete(item.id)}>
                      Mark Complete
                    </Button>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No follow-ups scheduled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}



