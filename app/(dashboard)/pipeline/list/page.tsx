"use client";

import useSWR from "swr";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CreateDealModal } from "@/components/pipeline/create-deal-modal";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DealListPage() {
  const { data, mutate, isLoading } = useSWR("/api/pipeline/list", fetcher);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const deals = data?.deals || [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deal List</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all deals in table format
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Deal</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Company</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Lead</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Stage</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Value</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Probability</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Owner</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Last Activity</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No deals yet. Create your first deal to get started.
                </td>
              </tr>
            ) : (
              deals.map((deal: any) => {
                const lead = deal.leads || {};
                const owner = deal.owner || {};
                const leadName =
                  [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                  lead.company ||
                  lead.email ||
                  "—";

                return (
                  <tr key={deal.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pipeline?deal=${deal.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {deal.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{lead.company || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {lead.id ? (
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-primary hover:underline"
                        >
                          {leadName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted capitalize">
                        {deal.stage.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(deal.value)}</td>
                    <td className="px-4 py-3 text-sm">{deal.probability || 0}%</td>
                    <td className="px-4 py-3 text-sm">
                      {owner.email || owner.full_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(deal.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {deal.next_action ? (
                        <div>
                          <div>{deal.next_action}</div>
                          {deal.next_action_due && (
                            <div className="text-xs text-muted-foreground">
                              Due: {formatDate(deal.next_action_due)}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateDealModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={() => {
          mutate();
          setIsCreateModalOpen(false);
        }}
      />
    </div>
  );
}









