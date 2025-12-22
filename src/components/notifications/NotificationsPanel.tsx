"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  X
} from "lucide-react";
import Link from "next/link";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  read_at: string | null;
  clicked_at: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

const TYPE_ICONS: Record<string, any> = {
  reply_detected: MessageSquare,
  auto_reply_sent: Mail,
  auto_reply_suggested: Sparkles,
  followup_scheduled: Calendar,
  followup_sent: Mail,
  lead_enriched: CheckCircle2,
  template_optimized: Sparkles,
  meeting_scheduled: Calendar,
  intent_detected: MessageSquare,
  error: AlertTriangle,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-50 border-blue-200",
  success: "bg-green-50 border-green-200",
  warning: "bg-yellow-50 border-yellow-200",
  error: "bg-red-50 border-red-200",
};

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadNotifications();
    subscribeToNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => !n.read_at).length);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function markAsRead(notificationId: string) {
    try {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  async function markAllAsRead() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }

  async function deleteNotification(notificationId: string) {
    try {
      await supabase.from("notifications").delete().eq("id", notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  }

  if (loading) {
    return <div className="p-4">Loading notifications...</div>;
  }

  const unreadNotifications = notifications.filter((n) => !n.read_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount} unread
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const Icon = TYPE_ICONS[notification.type] || Bell;
              const isUnread = !notification.read_at;
              const severityColor = SEVERITY_COLORS[notification.severity] || SEVERITY_COLORS.info;

              return (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border ${
                    isUnread ? `${severityColor} border-l-4` : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${severityColor.replace("bg-", "bg-").replace("-50", "-100")}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm font-medium ${isUnread ? "font-semibold" : ""}`}>
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          {notification.action_url && (
                            <Link
                              href={notification.action_url}
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => markAsRead(notification.id)}
                            >
                              View
                            </Link>
                          )}
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {notification.severity && (
                          <Badge
                            variant={
                              notification.severity === "error"
                                ? "destructive"
                                : notification.severity === "success"
                                ? "default"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {notification.severity}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isUnread && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

