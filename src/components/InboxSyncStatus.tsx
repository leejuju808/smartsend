"use client";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function InboxSyncStatus() {
  const [hasActiveAccounts, setHasActiveAccounts] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const checkActiveAccounts = async () => {
      try {
        const { data: accounts, error } = await supabase
          .from("email_accounts")
          .select("last_checked_at")
          .eq("is_active", true)
          .eq("provider", "gmail");

        if (error) {
          console.error("Error fetching email accounts:", error);
          return;
        }

        const hasAccounts = accounts && accounts.length > 0;
        setHasActiveAccounts(hasAccounts);

        if (hasAccounts && accounts.length > 0) {
          // Find the most recent last_checked_at
          const mostRecent = accounts
            .map(acc => acc.last_checked_at)
            .filter(Boolean)
            .sort()
            .pop();
          
          if (mostRecent) {
            const lastCheckedDate = new Date(mostRecent);
            const now = new Date();
            const diffMinutes = Math.floor((now.getTime() - lastCheckedDate.getTime()) / (1000 * 60));
            
            if (diffMinutes < 5) {
              setLastChecked("now");
            } else if (diffMinutes < 60) {
              setLastChecked(`${diffMinutes}m`);
            } else {
              const diffHours = Math.floor(diffMinutes / 60);
              setLastChecked(`${diffHours}h`);
            }
          }
        }
      } catch (err) {
        console.error("Error checking inbox sync status:", err);
      }
    };

    checkActiveAccounts();
    
    // Check every 30 seconds
    const interval = setInterval(checkActiveAccounts, 30000);
    return () => clearInterval(interval);
  }, [supabase]);

  if (hasActiveAccounts === null) return null;
  if (!hasActiveAccounts) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      <span>Inbox Sync: Active</span>
      {lastChecked && (
        <span className="text-green-600">• {lastChecked}</span>
      )}
    </div>
  );
}