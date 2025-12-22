"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bell,
  MessageSquare,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Mail,
  X,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  data: Record<string, any> | null;
  read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, any> = {
  reply_high_intent: MessageSquare,
  reply_general: MessageSquare,
  campaign_blocked: AlertTriangle,
  enrichment_finished: CheckCircle2,
  digest_daily: Mail,
  digest_weekly: Mail,
  deal_opened: Sparkles,
  mailbox_health_issue: AlertTriangle,
  meeting_time_extracted: Calendar,
  variant_outperforming: Sparkles,
};

const TYPE_LABELS: Record<string, string> = {
  reply_high_intent: "High-Intent Reply",
  reply_general: "General Reply",
  campaign_blocked: "Campaign Blocked",
  enrichment_finished: "Enrichment Finished",
  digest_daily: "Daily Digest",
  digest_weekly: "Weekly Digest",
  deal_opened: "New Deal",
  mailbox_health_issue: "Mailbox Health",
  meeting_time_extracted: "Meeting Detected",
  variant_outperforming: "Variant Performance",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  const PAGE_SIZE = 20;

  useEffect(() => {
    loadNotifications();
    subscribeToNotifications();
  }, [filter, page]);

  async function loadNotifications() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (filter) {
        query = query.eq("type", filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (page === 1) {
        setNotifications(data || []);
      } else {
        setNotifications((prev) => [...prev, ...(data || [])]);
      }

      setHasMore((data || []).length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToNotifications() {
    const { data: { user } } = supabase.auth.getUser();
    if (!user) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }

  async function markAsRead(id: string) {
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
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
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const uniqueTypes = Array.from(
    new Set(notifications.map((n) => n.type))
  ).filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      {uniqueTypes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={filter === null ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter(null);
              setPage(1);
            }}
          >
            All
          </Button>
          {uniqueTypes.map((type) => (
            <Button
              key={type}
              variant={filter === type ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(type);
                setPage(1);
              }}
            >
              {TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
      )}

      {/* Notifications List */}
      {loading && notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">Loading notifications...</p>
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">No notifications yet</p>
            <p className="text-sm text-gray-400 mt-2">
              You'll see alerts here when important events happen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const Icon =
              TYPE_ICONS[notification.type] || Bell;
            const isUnread = !notification.read;

            return (
              <Card
                key={notification.id}
                className={`cursor-pointer transition-all ${
                  isUnread
                    ? "border-l-4 border-l-yellow-400 bg-yellow-50/50"
                    : ""
                }`}
                onClick={() => markAsRead(notification.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        isUnread ? "bg-yellow-100" : "bg-gray-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3
                            className={`text-sm font-medium ${
                              isUnread ? "font-semibold" : ""
                            }`}
                          >
                            {notification.title}
                          </h3>
                          {notification.message && (
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.message}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-400">
                              {formatTimeAgo(notification.created_at)}
                            </span>
                            {notification.data?.thread_id && (
                              <Link
                                href={`/replies/${notification.data.thread_id}`}
                                className="text-xs text-blue-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View Thread →
                              </Link>
                            )}
                            {notification.data?.campaign_id && (
                              <Link
                                href={`/campaigns/${notification.data.campaign_id}`}
                                className="text-xs text-blue-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View Campaign →
                              </Link>
                            )}
                          </div>
                        </div>
                        {isUnread && (
                          <div className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <div className="text-center mt-6">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}








