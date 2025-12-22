"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Notification = {
  id: string;
  category?: "lead" | "task" | "call" | "campaign" | "billing";
  type: string;
  title: string;
  body?: string;
  url?: string;
  entity_type?: string;
  entity_id?: string;
};

function getNotificationIcon(type: string, category?: string): string {
  if (category === "lead") {
    if (type === "hot_lead") return "🔥";
    if (type === "warm_lead") return "🔥";
    if (type === "reply") return "💬";
    if (type === "sms_received") return "📱";
    if (type === "thread_resurfaced") return "🔔";
  }
  if (category === "task") {
    if (type === "task_assigned") return "✅";
    if (type === "task_due") return "⏰";
    if (type === "task_overdue") return "⚠️";
  }
  if (category === "call") {
    if (type === "missed_call") return "📞";
  }
  if (category === "campaign") {
    if (type === "campaign_paused") return "⏸️";
    if (type === "deliverability_issue") return "⚠️";
  }
  if (category === "billing") {
    if (type === "billing_issue") return "💳";
    if (type === "plan_limit_reached") return "📊";
  }
  return "🔔";
}

function getToastColor(category?: string): string {
  switch (category) {
    case "lead":
      return "bg-blue-50 border-blue-200";
    case "task":
      return "bg-yellow-50 border-yellow-200";
    case "call":
      return "bg-purple-50 border-purple-200";
    case "campaign":
      return "bg-orange-50 border-orange-200";
    case "billing":
      return "bg-red-50 border-red-200";
    default:
      return "bg-gray-50 border-gray-200";
  }
}

/**
 * NotificationToast - Real-time toast notifications that appear when new notifications are created
 * 
 * Features:
 * - Shows toast in bottom-right corner
 * - Auto-dismisses after 5 seconds
 * - Quick action buttons (Open Thread, Open Contact, etc.)
 * - Stacks multiple toasts
 */
export function NotificationToast() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [toasts, setToasts] = useState<Notification[]>([]);

  useEffect(() => {
    let channel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`notifications:toast:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const notification = payload.new as Notification;
            
            // Only show toast for important notification types
            const importantTypes = [
              "hot_lead",
              "warm_lead",
              "reply",
              "missed_call",
              "task_due",
              "task_overdue",
              "campaign_paused",
              "billing_issue",
            ];
            
            if (importantTypes.includes(notification.type)) {
              setToasts((prev) => [...prev, notification]);
              
              // Auto-dismiss after 5 seconds
              setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== notification.id));
              }, 5000);
            }
          }
        )
        .subscribe();

      return () => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase]);

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleOpen = (notification: Notification) => {
    if (notification.url) {
      router.push(notification.url);
    }
    handleDismiss(notification.id);
  };

  const getActionLabel = (notification: Notification): string => {
    if (notification.entity_type === "reply_thread") return "Open Thread";
    if (notification.entity_type === "contact") return "Open Contact";
    if (notification.entity_type === "task") return "Open Task";
    if (notification.entity_type === "campaign") return "Open Campaign";
    if (notification.url) return "Open";
    return "";
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border shadow-lg p-4 ${getToastColor(toast.category)} animate-in slide-in-from-right`}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">
              {getNotificationIcon(toast.type, toast.category)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{toast.title}</p>
              {toast.body && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {toast.body}
                </p>
              )}
              {toast.url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpen(toast)}
                  className="mt-2 h-7 text-xs"
                >
                  {getActionLabel(toast)}
                </Button>
              )}
            </div>
            <button
              onClick={() => handleDismiss(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}



























































