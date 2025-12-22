"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@/lib/supabase";

export default function EmailSettings() {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<{ email: string } | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // Check connection status on mount
    checkConnection();
    
    // Check URL params for connection status
    const params = new URLSearchParams(window.location.search);
    const connectedParam = params.get("connected");
    const errorParam = params.get("error");
    
    if (connectedParam === "gmail") {
      checkConnection();
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/settings/email");
    }
    
    if (errorParam) {
      alert(`Connection error: ${decodeURIComponent(errorParam)}`);
      window.history.replaceState({}, "", "/dashboard/settings/email");
    }
  }, []);

  const checkConnection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("provider_accounts")
      .select("email_address")
      .eq("provider", "gmail")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setConnected({ email: data.email_address });
    } else {
      setConnected(null);
    }
  };

  const connectGmail = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/oauth/google/start");
      const { url } = await res.json();
      window.location.href = url; // redirect to Google
    } catch (error) {
      console.error("Failed to start OAuth:", error);
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Email Provider</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Connect your Gmail to send and receive replies from SmartSend.
      </p>
      
      {connected ? (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-muted-foreground">
              Connected as <span className="font-medium text-foreground">{connected.email}</span>
            </p>
          </div>
          <Button onClick={connectGmail} disabled={loading} variant="outline">
            {loading ? "Redirecting…" : "Reconnect Gmail"}
          </Button>
        </div>
      ) : (
        <Button onClick={connectGmail} disabled={loading}>
          {loading ? "Redirecting…" : "Connect Gmail"}
        </Button>
      )}
    </div>
  );
}

