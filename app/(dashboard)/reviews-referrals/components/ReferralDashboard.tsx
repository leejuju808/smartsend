"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReferralLink {
  id: string;
  ref_code: string;
  clicks: number;
  leads_generated: number;
  created_at: string;
  homeowner_portals: {
    roofing_jobs: {
      title: string;
      leads: {
        first_name: string;
        last_name: string;
      };
    };
  };
}

interface ReferralDashboardProps {
  workspaceId?: string;
}

export function ReferralDashboard({ workspaceId }: ReferralDashboardProps) {
  const [referralLinks, setReferralLinks] = useState<ReferralLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!workspaceId) return;

      try {
        const response = await fetch(
          `/api/referrals/links?workspaceId=${workspaceId}`
        );
        if (response.ok) {
          const data = await response.json();
          setReferralLinks(data.referralLinks || []);
        }
      } catch (error) {
        console.error("Error fetching referral links:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId]);

  const calculateConversionRate = (clicks: number, leads: number) => {
    if (clicks === 0) return 0;
    return ((leads / clicks) * 100).toFixed(1);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {referralLinks.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No referral links yet. They'll be created automatically when jobs are completed.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referrer</TableHead>
                <TableHead>Link Clicks</TableHead>
                <TableHead>Leads Created</TableHead>
                <TableHead>Conversion Rate</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referralLinks.map((link) => {
                const homeowner = link.homeowner_portals?.roofing_jobs?.leads;
                const referrerName = homeowner
                  ? `${homeowner.first_name} ${homeowner.last_name}`
                  : "Unknown";

                return (
                  <TableRow key={link.id}>
                    <TableCell>{referrerName}</TableCell>
                    <TableCell>{link.clicks}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{link.leads_generated}</Badge>
                    </TableCell>
                    <TableCell>
                      {calculateConversionRate(link.clicks, link.leads_generated)}%
                    </TableCell>
                    <TableCell>
                      {new Date(link.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}



























