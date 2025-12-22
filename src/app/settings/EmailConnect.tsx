"use client"

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function EmailConnect() {
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function checkConnection() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("gmail_accounts")
          .select("email_address, last_sync_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          setConnectedEmail(data.email_address);
          setLastSync(data.last_sync_at);
        }
      }
    }
    checkConnection();
  }, [supabase]);

  return (
    <div className="p-4 border rounded-2xl space-y-2">
      <h3 className="font-semibold">Email Accounts</h3>
      <p className="text-sm text-muted-foreground">Send & receive from your own mailbox.</p>
      <div className="flex gap-2 items-center">
        {connectedEmail ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Connected: {connectedEmail}</span>
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Last sync: {new Date(lastSync).toLocaleString()}
              </span>
            )}
          </div>
        ) : (
          <a
            href="/api/oauth/google/start"
            className="inline-flex items-center rounded-xl px-4 py-2 bg-black text-white"
          >
            Connect Gmail
          </a>
        )}
        {/* Outlook later */}
      </div>
    </div>
  )
}