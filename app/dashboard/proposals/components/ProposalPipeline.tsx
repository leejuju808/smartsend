// Block 57000 — Proposal Pipeline Component
// Shows proposals in columns: Draft, Sent, Viewed, Signed, Lost

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

type Proposal = {
  id: string;
  status: string;
  total_price: number;
  homeowner: { name?: string; email?: string } | null;
  viewed_at: string | null;
  signed_at: string | null;
  created_at: string;
  public_token: string;
};

const statusColumns = [
  { key: "draft", label: "Draft", color: "gray" },
  { key: "sent", label: "Sent", color: "blue" },
  { key: "viewed", label: "Viewed", color: "yellow" },
  { key: "signed", label: "Signed", color: "green" },
  { key: "lost", label: "Lost", color: "red" },
];

export function ProposalPipeline() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      const response = await fetch("/api/proposals/list");
      if (response.ok) {
        const data = await response.json();
        setProposals(data.proposals || []);
      }
    } catch (error) {
      console.error("Error loading proposals:", error);
    } finally {
      setLoading(false);
    }
  };

  const getProposalsByStatus = (status: string) => {
    return proposals.filter((p) => {
      if (status === "signed") return p.status === "signed" || p.signed_at !== null;
      if (status === "viewed") return p.status === "viewed" && !p.signed_at;
      if (status === "lost") return p.status === "lost" || p.status === "declined";
      return p.status === status;
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-4">
        {statusColumns.map((col) => (
          <Card key={col.key}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-full mb-4" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {statusColumns.map((column) => {
        const columnProposals = getProposalsByStatus(column.key);
        return (
          <Card key={column.key}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{column.label}</h3>
                <Badge variant="outline">{columnProposals.length}</Badge>
              </div>
              <div className="space-y-2">
                {columnProposals.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No proposals
                  </p>
                ) : (
                  columnProposals.map((proposal) => (
                    <Link
                      key={proposal.id}
                      href={`/dashboard/proposals/${proposal.id}`}
                      className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium">
                          {proposal.homeowner?.name || "Homeowner"}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          ${proposal.total_price?.toLocaleString() || "0"}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        {new Date(proposal.created_at).toLocaleDateString()}
                      </p>
                      {proposal.viewed_at && (
                        <p className="text-xs text-blue-600 mt-1">
                          Viewed {new Date(proposal.viewed_at).toLocaleDateString()}
                        </p>
                      )}
                      {proposal.signed_at && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Signed {new Date(proposal.signed_at).toLocaleDateString()}
                        </p>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
































