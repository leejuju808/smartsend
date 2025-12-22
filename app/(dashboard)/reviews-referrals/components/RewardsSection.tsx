"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReferralReward {
  id: string;
  reward_type: string;
  reward_value: number;
  status: "pending" | "issued";
  created_at: string;
  referral_links: {
    homeowner_portals: {
      roofing_jobs: {
        leads: {
          first_name: string;
          last_name: string;
        };
      };
    };
  };
}

interface RewardsSectionProps {
  workspaceId?: string;
}

export function RewardsSection({ workspaceId }: RewardsSectionProps) {
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!workspaceId) return;

      try {
        const response = await fetch(
          `/api/referrals/rewards?workspaceId=${workspaceId}`
        );
        if (response.ok) {
          const data = await response.json();
          setRewards(data.rewards || []);
        }
      } catch (error) {
        console.error("Error fetching rewards:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId]);

  const handleMarkIssued = async (rewardId: string) => {
    try {
      const response = await fetch(`/api/referrals/rewards/${rewardId}/mark-issued`, {
        method: "POST",
      });
      if (response.ok) {
        setRewards((prev) =>
          prev.map((r) =>
            r.id === rewardId ? { ...r, status: "issued" as const } : r
          )
        );
      }
    } catch (error) {
      console.error("Error marking reward as issued:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rewards</CardTitle>
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
        <CardTitle>Rewards</CardTitle>
      </CardHeader>
      <CardContent>
        {rewards.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No rewards yet. They'll appear here when referral jobs are closed.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Homeowner</TableHead>
                <TableHead>Reward Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => {
                const homeowner =
                  reward.referral_links?.homeowner_portals?.roofing_jobs?.leads;
                const homeownerName = homeowner
                  ? `${homeowner.first_name} ${homeowner.last_name}`
                  : "Unknown";

                return (
                  <TableRow key={reward.id}>
                    <TableCell>{homeownerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{reward.reward_type}</Badge>
                    </TableCell>
                    <TableCell>${reward.reward_value}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reward.status === "issued" ? "default" : "secondary"
                        }
                      >
                        {reward.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {reward.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkIssued(reward.id)}
                        >
                          Mark as Issued
                        </Button>
                      )}
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



























