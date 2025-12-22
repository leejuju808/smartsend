"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AcceptInviteClient({ token }: { token: string }) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [msg, setMsg] = useState("Finalizing your access...");

  useEffect(() => {
    if (!token) {
      setMsg("Invalid invite link. Missing token.");
      return;
    }

    (async () => {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session.session) {
        setMsg("Please sign in via the email link, then this will continue automatically.");
        return; // User arrived directly without magic link sign-in
      }

      // Call accept invite API route
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const result = await res.json();

      if (!res.ok) {
        setMsg(result.error || "Failed to accept invite");
        return;
      }

      if (result.success) {
        setMsg("Invite accepted. Redirecting...");
        
        if (result.campaign_id) {
          router.replace(`/dashboard/campaigns/${result.campaign_id}`);
        } else {
          router.replace("/dashboard");
        }
      } else {
        setMsg("Unexpected response from server");
      }
    })();
  }, [supabase, token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="text-lg font-medium text-gray-900 mb-2">Processing invite...</div>
        <div className="text-sm text-gray-600">{msg}</div>
      </div>
    </div>
  );
}

