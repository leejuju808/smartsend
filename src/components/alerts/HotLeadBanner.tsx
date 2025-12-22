"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { X, Flame } from "lucide-react";

interface HotLeadAlert {
  id: string;
  lead_id: string;
  lead_name: string | null;
  reply_snippet: string | null;
  created_at: string;
}

/**
 * HotLeadBanner - Instant banner notification for HOT leads
 * 
 * Features:
 * - Appears at top of dashboard when HOT lead is detected
 * - Shows lead name and reply snippet
 * - "View Lead" button to navigate to lead
 * - Auto-dismisses after 10 seconds
 * - Can be manually dismissed
 */
export function HotLeadBanner() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [alert, setAlert] = useState<HotLeadAlert | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let channel: any;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to hot_lead_alerts table
      channel = supabase
        .channel(`hot_lead_alerts:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "hot_lead_alerts",
            filter: `user_id=eq.${user.id}`,
          },
          async (payload: any) => {
            const newAlert = payload.new as HotLeadAlert;
            
            // Only show if not already dismissed and sent_in_app is true
            if (!dismissed.has(newAlert.id) && newAlert.sent_in_app !== false) {
              setAlert(newAlert);
              
              // Auto-dismiss after 10 seconds
              setTimeout(() => {
                setDismissed((prev) => new Set(prev).add(newAlert.id));
                setAlert(null);
              }, 10000);
            }
          }
        )
        .subscribe();

      // Also check for recent alerts on mount
      const { data: recentAlerts } = await supabase
        .from("hot_lead_alerts")
        .select("id, lead_id, lead_name, reply_snippet, created_at, sent_in_app")
        .eq("user_id", user.id)
        .eq("sent_in_app", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (recentAlerts && recentAlerts.length > 0) {
        const recentAlert = recentAlerts[0];
        // Only show if created in last 5 minutes
        const alertTime = new Date(recentAlert.created_at).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        
        if (alertTime > fiveMinutesAgo && !dismissed.has(recentAlert.id)) {
          setAlert(recentAlert);
          
          setTimeout(() => {
            setDismissed((prev) => new Set(prev).add(recentAlert.id));
            setAlert(null);
          }, 10000);
        }
      }

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
  }, [supabase, dismissed]);

  const handleDismiss = () => {
    if (alert) {
      setDismissed((prev) => new Set(prev).add(alert.id));
      setAlert(null);
    }
  };

  const handleViewLead = () => {
    if (alert) {
      router.push(`/leads/${alert.lead_id}`);
      handleDismiss();
    }
  };

  if (!alert || dismissed.has(alert.id)) {
    return null;
  }

  const displayName = alert.lead_name || "Unknown Lead";
  const snippet = alert.reply_snippet 
    ? (alert.reply_snippet.length > 100 
        ? alert.reply_snippet.slice(0, 100) + "..." 
        : alert.reply_snippet)
    : "Hot lead detected";

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3 flex-1">
            <Flame className="h-5 w-5 text-yellow-300 animate-pulse" />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                🔥 New HOT Lead: {displayName}
              </div>
              <div className="text-xs text-yellow-100 mt-0.5">
                "{snippet}"
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewLead}
              className="px-4 py-1.5 bg-white text-red-600 rounded-md text-sm font-semibold hover:bg-yellow-50 transition-colors"
            >
              View Lead
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded-md transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

