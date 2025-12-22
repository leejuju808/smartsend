"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Mail, AlertTriangle, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EmailIdentity {
  id: string;
  email_address: string;
  provider: "gmail" | "outlook";
  verified: boolean;
  daily_send_limit: number;
  warmup_score?: number;
  risk_score?: number;
  dns_status?: {
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
  };
}

interface Step2ConnectEmailProps {
  onNext: (data: { sendingIdentityId: string }) => void;
  onBack: () => void;
  selectedIdentityId?: string;
}

export function Step2ConnectEmail({ onNext, onBack, selectedIdentityId }: Step2ConnectEmailProps) {
  const [identities, setIdentities] = useState<EmailIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedIdentityId);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadIdentities();
  }, []);

  const loadIdentities = async () => {
    try {
      const res = await fetch("/api/settings/sending-identities");
      if (!res.ok) throw new Error("Failed to load identities");
      const data = await res.json();
      setIdentities(data.identities || []);
      
      if (data.identities?.length > 0 && !selectedId) {
        setSelectedId(data.identities[0].id);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load identities");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      // Redirect to Gmail OAuth
      window.location.href = "/api/auth/google/connect";
    } catch (error: any) {
      toast.error("Failed to connect Gmail");
      setConnecting(false);
    }
  };

  const handleConnectOutlook = async () => {
    setConnecting(true);
    try {
      // Redirect to Outlook OAuth
      window.location.href = "/api/auth/outlook/connect";
    } catch (error: any) {
      toast.error("Failed to connect Outlook");
      setConnecting(false);
    }
  };

  const handleNext = () => {
    if (!selectedId) {
      toast.error("Please select or connect a sending email");
      return;
    }
    onNext({ sendingIdentityId: selectedId });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const selectedIdentity = identities.find((id) => id.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Connect Your Sending Email</h2>
        <p className="text-gray-600 mt-2">
          Connect your email account to start sending campaigns
        </p>
      </div>

      {identities.length === 0 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connect Email Account</CardTitle>
              <CardDescription>
                Choose how you want to connect your sending email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleConnectGmail}
                disabled={connecting}
                className="w-full justify-start"
                variant="outline"
              >
                <Mail className="w-5 h-5 mr-2" />
                Connect Gmail / Google Workspace
              </Button>
              <Button
                onClick={handleConnectOutlook}
                disabled={connecting}
                className="w-full justify-start"
                variant="outline"
              >
                <Mail className="w-5 h-5 mr-2" />
                Connect Outlook / Office 365
              </Button>
              <div className="text-sm text-muted-foreground pt-2">
                <p>Advanced: Custom SMTP setup available in settings</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {identities.map((identity) => (
            <Card
              key={identity.id}
              className={`cursor-pointer transition-all ${
                selectedId === identity.id ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setSelectedId(identity.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className={`w-4 h-4 rounded-full border-2 mt-1 ${
                      selectedId === identity.id
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}>
                      {selectedId === identity.id && (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold">{identity.email_address}</h3>
                        <Badge variant="outline">{identity.provider}</Badge>
                        {identity.verified && (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      
                      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Daily Limit</p>
                          <p className="font-medium">{identity.daily_send_limit} emails/day</p>
                        </div>
                        {identity.warmup_score !== undefined && (
                          <div>
                            <p className="text-muted-foreground">Warmup Score</p>
                            <p className="font-medium">{identity.warmup_score}/100</p>
                          </div>
                        )}
                      </div>

                      {identity.dns_status && (
                        <div className="mt-3 flex items-center space-x-4 text-xs">
                          <div className="flex items-center space-x-1">
                            {identity.dns_status.spf ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                            <span>SPF</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            {identity.dns_status.dkim ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                            <span>DKIM</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            {identity.dns_status.dmarc ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                            <span>DMARC</span>
                          </div>
                        </div>
                      )}

                      {identity.risk_score !== undefined && identity.risk_score > 70 && (
                        <div className="mt-3 flex items-center space-x-2 text-sm text-yellow-600">
                          <Shield className="w-4 h-4" />
                          <span>Reputation Guard: High risk detected</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            onClick={handleConnectGmail}
            variant="outline"
            className="w-full"
          >
            <Mail className="w-4 h-4 mr-2" />
            Connect Another Email
          </Button>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!selectedId}>
          Next Step
        </Button>
      </div>
    </div>
  );
}




























































