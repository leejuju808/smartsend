"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type GmailAccount = { email: string | null };

export default function IntegrationsPage() {
  const supabase = createClientComponentClient();
  const [gmail, setGmail] = useState<GmailAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data } = await supabase
        .from("gmail_accounts")
        .select("email")
        .eq("user_id", user.id)
        .maybeSingle();
      setGmail(data ? { email: data.email } : null);
      setLoading(false);
    })();
  }, []);

  const connect = () => { window.location.href = "/api/google/oauth/start"; };

  const disconnect = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("gmail_accounts").delete().eq("user_id", user.id);
    setGmail(null);
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Integrations</h1>

      <div className="rounded-2xl border border-zinc-800 p-5 flex items-center justify-between">
        <div>
          <div className="text-lg font-medium">Gmail</div>
          <div className="text-sm text-zinc-400">
            {loading ? "Checking..." : gmail ? `Connected: ${gmail.email}` : "Not connected"}
          </div>
        </div>
        <div className="flex gap-2">
          {!gmail ? (
            <button onClick={connect} className="px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20">
              Connect
            </button>
          ) : (
            <button onClick={disconnect} className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20">
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
