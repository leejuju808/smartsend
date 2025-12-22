"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

declare global {
  interface Window {
    OneSignal: any;
  }
}

/**
 * Hook to register a device for push notifications
 * 
 * This hook initializes OneSignal (or other push providers) and registers
 * the device with SmartSend so HOT lead alerts can be sent.
 * 
 * Usage:
 * ```tsx
 * import { useRegisterPushTarget } from "@/app/hooks/useRegisterPushTarget";
 * 
 * export function AuthenticatedShell({ orgId, children }: { orgId: string; children: React.ReactNode }) {
 *   useRegisterPushTarget(orgId);
 *   return <>{children}</>;
 * }
 * ```
 */
export function useRegisterPushTarget(orgId: string | undefined) {
  useEffect(() => {
    if (!orgId) return;
    if (typeof window === "undefined") return;
    if (!window.OneSignal) return;

    const OneSignal = window.OneSignal || [];
    
    OneSignal.push(function () {
      OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
      });

      OneSignal.on("subscriptionChange", async function (isSubscribed: boolean) {
        if (!isSubscribed) return;

        try {
          const playerId = await OneSignal.getUserId();
          if (!playerId) return;

          // Save/update in Supabase via API route
          const response = await fetch("/api/push/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: "onesignal",
              target_id: playerId,
              org_id: orgId,
              device_label: navigator.userAgent,
            }),
          });

          if (!response.ok) {
            console.error("Failed to register push target", await response.text());
          }
        } catch (error) {
          console.error("Error registering push target", error);
        }
      });
    });
  }, [orgId]);
}















































