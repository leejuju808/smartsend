"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Phone, Mail, Wrench } from "lucide-react";
import Link from "next/link";

interface MaterialIssue {
  material_order_id: string;
  job_id: string;
  job_title: string;
  status: string;
  expected_delivery_date: string;
  issue_reported: boolean;
  issue_description: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  supplier_email: string | null;
  issue_type: string | null;
  material_items: any[] | null;
}

interface MaterialIssuesPanelProps {
  issues: MaterialIssue[];
}

export function MaterialIssuesPanel({ issues }: MaterialIssuesPanelProps) {
  const getIssueBadge = (type: string | null) => {
    switch (type) {
      case "issue_reported":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Issue Reported
          </Badge>
        );
      case "delayed":
        return (
          <Badge variant="default" className="bg-yellow-500 text-white">
            Delayed
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive">Overdue</Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Material & Supplier Issues
          </span>
          {issues.length > 0 && (
            <Badge variant="destructive">{issues.length} issues</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-green-600 font-semibold">
              ✓ No material issues detected
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => (
              <div
                key={issue.material_order_id}
                className="p-4 border rounded-lg border-orange-200 bg-orange-50"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/dashboard/jobs/${issue.job_id}`}
                        className="font-semibold hover:underline"
                      >
                        {issue.job_title}
                      </Link>
                      {getIssueBadge(issue.issue_type)}
                    </div>
                    {issue.issue_description && (
                      <p className="text-sm text-muted-foreground">
                        {issue.issue_description}
                      </p>
                    )}
                    {issue.expected_delivery_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected: {new Date(issue.expected_delivery_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                {issue.supplier_name && (
                  <div className="mt-3 pt-3 border-t border-orange-200">
                    <div className="text-sm font-medium mb-2">
                      Supplier: {issue.supplier_name}
                    </div>
                    <div className="flex gap-2">
                      {issue.supplier_phone && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            window.open(`tel:${issue.supplier_phone}`)
                          }
                        >
                          <Phone className="w-3 h-3 mr-1" />
                          Call
                        </Button>
                      )}
                      {issue.supplier_email && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            window.open(`mailto:${issue.supplier_email}`)
                          }
                        >
                          <Mail className="w-3 h-3 mr-1" />
                          Email
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        asChild
                      >
                        <Link href={`/dashboard/jobs/${issue.job_id}/materials`}>
                          <Wrench className="w-3 h-3 mr-1" />
                          Fix Issue
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}






































