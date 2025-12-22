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

interface ReviewRequest {
  id: string;
  homeowner_email: string;
  sent_at: string;
  status: "sent" | "clicked" | "completed" | "ignored";
  review_platform: string;
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

interface ReviewRequestsTableProps {
  workspaceId?: string;
}

export function ReviewRequestsTable({ workspaceId }: ReviewRequestsTableProps) {
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!workspaceId) return;

      try {
        const response = await fetch(
          `/api/reviews/requests?workspaceId=${workspaceId}`
        );
        if (response.ok) {
          const data = await response.json();
          setReviewRequests(data.reviewRequests || []);
        }
      } catch (error) {
        console.error("Error fetching review requests:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "success" | "destructive"> = {
      sent: "default",
      clicked: "secondary",
      completed: "success",
      ignored: "destructive",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Requests</CardTitle>
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
        <CardTitle>Review Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {reviewRequests.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No review requests yet. They'll appear here when jobs are completed.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Homeowner</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Sent Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewRequests.map((request) => {
                const homeowner = request.homeowner_portals?.roofing_jobs?.leads;
                const homeownerName = homeowner
                  ? `${homeowner.first_name} ${homeowner.last_name}`
                  : request.homeowner_email;

                return (
                  <TableRow key={request.id}>
                    <TableCell>{homeownerName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {request.review_platform || "Google"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(request.sent_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
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



























