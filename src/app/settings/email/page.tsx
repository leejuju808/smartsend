"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CheckCircle2, Mail, AlertCircle } from "lucide-react";

export default function EmailSettings() {
  const [connected, setConnected] = useState<{ email: string; provider: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    checkConnection();
    
    // Check for callback params
    const connectedParam = searchParams.get("connected");
    const error = searchParams.get("error");
    
    if (connectedParam === "gmail") {
      checkConnection();
    }
    if (error) {
      console.error("OAuth error:", error);
    }
  }, [searchParams]);

  async function checkConnection() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("provider_accounts")
        .select("email_address, provider")
        .eq("user_id", user.id)
        .maybeSingle();
        
      setConnected(data ? { email: data.email_address, provider: data.provider } : null);
    } catch (error) {
      console.error("Error checking connection:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleConnectGmail() {
    // Use server-side route for OAuth start
    window.location.href = "/api/oauth/provider-accounts/start";
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Email Provider</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Connected Account</CardTitle>
          <CardDescription>
            Connect your Gmail account to send replies from your inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : connected ? (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="font-medium">{connected.email}</div>
                  <div className="text-sm text-gray-500">Provider: {connected.provider}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                No email account connected. Connect Gmail to start sending replies.
              </p>
              <Button onClick={handleConnectGmail} className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Connect Gmail
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
