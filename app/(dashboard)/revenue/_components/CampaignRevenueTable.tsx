"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Campaign = {
  campaignId: string;
  campaignName: string;
  leads: number;
  jobsWon: number;
  revenueWon: number;
  avgJobValue: number | null;
  closeRate: number;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

type SortField = "revenueWon" | "jobsWon" | "closeRate" | null;
type SortDirection = "asc" | "desc";

export function CampaignRevenueTable({ campaigns }: { campaigns: Campaign[] }) {
  const [sortField, setSortField] = useState<SortField>("revenueWon");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedCampaigns = [...campaigns].sort((a, b) => {
    if (!sortField) return 0;
    
    let aValue: number;
    let bValue: number;
    
    switch (sortField) {
      case "revenueWon":
        aValue = a.revenueWon;
        bValue = b.revenueWon;
        break;
      case "jobsWon":
        aValue = a.jobsWon;
        bValue = b.jobsWon;
        break;
      case "closeRate":
        aValue = a.closeRate;
        bValue = b.closeRate;
        break;
      default:
        return 0;
    }
    
    if (sortDirection === "asc") {
      return aValue - bValue;
    } else {
      return bValue - aValue;
    }
  });

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No campaign revenue data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -ml-3"
                onClick={() => handleSort(null)}
              >
                Campaign Name
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -ml-3"
                onClick={() => handleSort("revenueWon")}
              >
                <div className="flex items-center gap-1">
                  Revenue Won
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -ml-3"
                onClick={() => handleSort("jobsWon")}
              >
                <div className="flex items-center gap-1">
                  Jobs Won
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </Button>
            </TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Avg Job Value</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -ml-3"
                onClick={() => handleSort("closeRate")}
              >
                <div className="flex items-center gap-1">
                  Close Rate
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedCampaigns.map((campaign) => (
            <TableRow key={campaign.campaignId}>
              <TableCell className="font-medium">
                <Link
                  href={`/campaigns/${campaign.campaignId}/analytics`}
                  className="text-blue-600 hover:underline"
                >
                  {campaign.campaignName}
                </Link>
              </TableCell>
              <TableCell>{formatCurrency(campaign.revenueWon)}</TableCell>
              <TableCell>{campaign.jobsWon}</TableCell>
              <TableCell>{campaign.leads}</TableCell>
              <TableCell>
                {campaign.avgJobValue
                  ? formatCurrency(campaign.avgJobValue)
                  : "—"}
              </TableCell>
              <TableCell>{campaign.closeRate.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}




























































