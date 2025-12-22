"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Homeowner Notifications Component

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle, Package, Wrench, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";

interface Notification {
  id: string;
  type: string;
  message: string;
  sent_at: string;
  read_at: string | null;
}

interface HomeownerNotificationsProps {
  notifications: Notification[];
}

const NOTIFICATION_ICONS: Record<string, any> = {
  crew_en_route: Clock,
  crew_arrived: CheckCircle,
  material_delivered: Package,
  milestone_reached: CheckCircle,
  weather_delay: AlertTriangle,
  day_end_summary: Clock,
  job_completion: CheckCircle,
  photo_uploaded: Package,
  general_update: Bell,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  crew_en_route: "text-blue-600",
  crew_arrived: "text-green-600",
  material_delivered: "text-purple-600",
  milestone_reached: "text-green-600",
  weather_delay: "text-orange-600",
  day_end_summary: "text-gray-600",
  job_completion: "text-green-600",
  photo_uploaded: "text-blue-600",
  general_update: "text-gray-600",
};

export function HomeownerNotifications({
  notifications,
}: HomeownerNotificationsProps) {
  if (notifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No notifications yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          {unreadCount > 0 && (
            <Badge variant="default">{unreadCount} new</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications.map((notification) => {
            const Icon =
              NOTIFICATION_ICONS[notification.type] || Bell;
            const colorClass =
              NOTIFICATION_COLORS[notification.type] || "text-gray-600";

            return (
              <div
                key={notification.id}
                className={`p-3 rounded-lg border ${
                  !notification.read_at
                    ? "bg-blue-50 border-blue-200"
                    : "bg-muted/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 mt-0.5 ${colorClass}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(notification.sent_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  {!notification.read_at && (
                    <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0 mt-2" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}




























