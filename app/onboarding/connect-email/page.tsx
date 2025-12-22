"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type EmailAccount = {
  id: string;
  provider: "gmail" | "outlook";
  email: string;
  display_name: string | null;
  status: string;
  daily_cap_override: number | null;
  last_synced_at: string | null;
};

export default function ConnectEmailOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAnyConnected = accounts.length > 0;

  // Check for OAuth callback messages
  useEffect(() => {
    const connected = searchParams.get("connected");
    const errorParam = searchParams.get("error");

    if (connected) {
      // Reload accounts after successful connection
      setError(null);
      // Accounts will reload below
    }

    if (errorParam) {
      setError(
        errorParam === "google_oauth" || errorParam === "outlook_oauth"
          ? "OAuth authentication failed. Please try again."
          : errorParam === "missing_code"
          ? "Missing authorization code. Please try connecting again."
          : errorParam === "bad_state"
          ? "Invalid state parameter. Please try connecting again."
          : errorParam === "token_exchange"
          ? "Failed to exchange authorization code. Please try again."
          : errorParam === "userinfo"
          ? "Failed to fetch user information. Please try again."
          : errorParam === "save_failed"
          ? "Failed to save inbox connection. Please try again."
          : errorParam === "server"
          ? "Server error occurred. Please try again."
          : "An error occurred. Please try again."
      );
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingAccounts(true);
      try {
        const res = await fetch("/api/email/accounts");
        if (!res.ok) {
          throw new Error("Failed to load accounts");
        }
        const data = await res.json();
        if (!cancelled) {
          setAccounts(data.accounts ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError("Could not load connected accounts.");
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnectGoogle = () => {
    // server route will redirect to Google OAuth
    window.location.href = "/api/email/connect/google";
  };

  const handleConnectOutlook = () => {
    // server route will redirect to Outlook OAuth
    window.location.href = "/api/email/connect/outlook";
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/connect-email/complete", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }

      router.push(data.next ?? "/onboarding/upload");
    } catch (e) {
      console.error(e);
      setError("Something went wrong.");
      setSubmitting(false);
    }
  };

  const gmailConnected = accounts.some((a) => a.provider === "gmail");
  const outlookConnected = accounts.some((a) => a.provider === "outlook");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-3xl space-y-6 p-6 border rounded-2xl shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Connect your inbox</h1>
          <p className="text-sm text-muted-foreground">
            SmartSend reaches homeowners from these inboxes and tracks responses. You can add more
            later in Settings.
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={gmailConnected ? "border-green-500/70" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Gmail</span>
                {gmailConnected ? (
                  <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Not connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect a Google Workspace or Gmail inbox to reach homeowners and track responses.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Requires sending + basic profile permissions.
              </div>
              <Button size="sm" variant={gmailConnected ? "outline" : "default"} onClick={handleConnectGoogle}>
                {gmailConnected ? "Connect another" : "Connect Gmail"}
              </Button>
            </CardFooter>
          </Card>

          <Card className={outlookConnected ? "border-green-500/70" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Outlook</span>
                {outlookConnected ? (
                  <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Not connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Connect Microsoft 365 or Outlook inboxes to reach homeowners and track responses.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Connect via Microsoft identity platform.
              </div>
              <Button size="sm" variant={outlookConnected ? "outline" : "default"} onClick={handleConnectOutlook}>
                {outlookConnected ? "Connect another" : "Connect Outlook"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Connected accounts</h2>
          <div className="border rounded-md p-3 text-sm min-h-[56px]">
            {loadingAccounts ? (
              <span className="text-muted-foreground">Loading accounts...</span>
            ) : accounts.length === 0 ? (
              <span className="text-muted-foreground">
                No accounts connected yet. Connect at least one to continue.
              </span>
            ) : (
              <ul className="space-y-1">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <span>
                      <span className="font-medium mr-1">{a.display_name ?? a.email}</span>
                      <span className="text-muted-foreground text-xs">
                        ({a.provider === "gmail" ? "Gmail" : "Outlook"})
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        a.status === "connected"
                          ? "border-green-500 text-green-600 text-xs"
                          : "border-amber-500 text-amber-600 text-xs"
                      }
                    >
                      {a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleContinue} disabled={submitting || !hasAnyConnected}>
            {submitting ? "Saving..." : "Continue to homeowner upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}










