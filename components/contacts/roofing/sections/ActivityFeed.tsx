// Block 20710 — Activity Feed (from Block 20680)

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Activity, Mail, FileText, Calendar, DollarSign, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityFeedProps {
  activities: Array<{
    id: string;
    category: string;
    type: string;
    severity: string;
    summary: string;
    details: any;
    source: string;
    createdAt: string;
    user: any;
  }>;
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "messaging":
        return <Mail className="h-4 w-4" />;
      case "pipeline":
        return <Activity className="h-4 w-4" />;
      case "revenue":
        return <DollarSign className="h-4 w-4" />;
      case "task":
        return <FileText className="h-4 w-4" />;
      case "scheduler":
        return <Calendar className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-300";
      case "important":
        return "bg-orange-100 text-orange-700 border-orange-300";
      case "success":
        return "bg-green-100 text-green-700 border-green-300";
      default:
        return "bg-blue-100 text-blue-700 border-blue-300";
    }
  };

  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50"
            >
              <div className="mt-0.5 text-muted-foreground">
                {getCategoryIcon(activity.category)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{activity.summary}</span>
                  <Badge className={getSeverityColor(activity.severity)} variant="outline">
                    {activity.severity}
                  </Badge>
                  {activity.source && (
                    <Badge variant="outline" className="text-xs">
                      {activity.source}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                  {activity.user && (
                    <span className="ml-2">
                      by {activity.user.email || activity.user.raw_user_meta_data?.full_name || "System"}
                    </span>
                  )}
                </div>
                {activity.details && Object.keys(activity.details).length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {activity.details.stage && `Stage: ${activity.details.stage}`}
                    {activity.details.amount && `Amount: $${activity.details.amount.toLocaleString()}`}
                    {activity.details.type && `Type: ${activity.details.type}`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
















































