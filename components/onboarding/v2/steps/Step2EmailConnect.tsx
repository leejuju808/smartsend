"use client";

// Block 16800 — Step 2: Connect Email & Domain Health Check

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/Alert";

export function OnboardingStep2({
  onComplete,
}: {
  onComplete: (data: any) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [domainHealth, setDomainHealth] = useState<any>(null);
  const [emailProvider, setEmailProvider] = useState<"gmail" | "microsoft" | "custom" | null>(null);

  useEffect(() => {
    // Check if email is already connected
    checkEmailConnection();
  }, []);

  const checkEmailConnection = async () => {
    try {
      // Check for connected accounts
      const res = await fetch("/api/settings/email/status");
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          setConnected(true);
          setEmailProvider(data.provider);
          checkDomainHealth();
        }
      }
    } catch (error) {
      console.error("Error checking email connection:", error);
    }
  };

  const checkDomainHealth = async () => {
    try {
      const res = await fetch("/api/deliverability/domain-health");
      if (res.ok) {
        const data = await res.json();
        setDomainHealth(data);
      }
    } catch (error) {
      console.error("Error checking domain health:", error);
    }
  };

  const handleConnect = async (provider: "gmail" | "microsoft" | "custom") => {
    setConnecting(true);
    setEmailProvider(provider);

    try {
      if (provider === "gmail") {
        window.location.href = "/api/mail/gmail/start";
      } else if (provider === "microsoft") {
        window.location.href = "/api/auth/start/outlook";
      } else {
        // Custom domain setup
        window.location.href = "/dashboard/settings/email";
      }
    } catch (error) {
      console.error("Error connecting email:", error);
      setConnecting(false);
    }
  };

  const handleContinue = async () => {
    try {
      await fetch("/api/onboarding/v2/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 2,
          stepData: {
            step_2_email_connected: true,
          },
          win: "win_1_email_connected",
        }),
      });

      onComplete({ email_connected: true });
    } catch (error) {
      console.error("Error saving step 2:", error);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Step 2: Connect Email & Domain</CardTitle>
        </div>
        <CardDescription>
          Connect your email account. SmartSend will show domain reputation and send limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!connected ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handleConnect("gmail")}
                disabled={connecting}
              >
                <Mail className="h-6 w-6" />
                <span>Gmail</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handleConnect("microsoft")}
                disabled={connecting}
              >
                <Mail className="h-6 w-6" />
                <span>Microsoft</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handleConnect("custom")}
                disabled={connecting}
              >
                <Mail className="h-6 w-6" />
                <span>Custom Domain</span>
              </Button>
            </div>

            {connecting && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Redirecting to email provider...
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <>
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Email connected successfully! {emailProvider && `(${emailProvider})`}
              </AlertDescription>
            </Alert>

            {domainHealth && (
              <div className="space-y-4">
                <h3 className="font-semibold">Domain Health Check</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Domain Reputation</div>
                    <div className="text-2xl font-bold">
                      {domainHealth.reputation || "Good"}
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Send Limits</div>
                    <div className="text-2xl font-bold">
                      {domainHealth.send_limit || "100/day"}
                    </div>
                  </div>
                </div>
                {domainHealth.warnings && domainHealth.warnings.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {domainHealth.warnings.map((w: string, i: number) => (
                        <div key={i}>{w}</div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleContinue}>
                Continue to Import List →
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

