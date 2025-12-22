"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Star } from "lucide-react";

type EmailIdentity = {
  id: string;
  identity_name: string | null;
  display_name: string | null;
  email_address: string;
  provider: "gmail" | "outlook";
  is_primary: boolean;
  verified: boolean;
  daily_send_limit: number;
};

interface SendingIdentitySelectProps {
  value?: string | null;
  onChange: (identityId: string | null) => void;
  orgId?: string | null;
}

export function SendingIdentitySelect({
  value,
  onChange,
  orgId,
}: SendingIdentitySelectProps) {
  const [identities, setIdentities] = useState<EmailIdentity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIdentities = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/sending-identities");
        if (!res.ok) throw new Error("Failed to load identities");
        const data = await res.json();
        setIdentities(data.identities || []);
        
        // Auto-select primary identity if no value is set
        if (!value && data.identities?.length > 0) {
          const primary = data.identities.find((i: EmailIdentity) => i.is_primary);
          if (primary) {
            onChange(primary.id);
          }
        }
      } catch (error) {
        console.error("Failed to load sending identities:", error);
      } finally {
        setLoading(false);
      }
    };

    loadIdentities();
  }, [value, onChange]);

  const formatProvider = (provider: string) => {
    return provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : provider;
  };

  const selectedIdentity = identities.find((i) => i.id === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="sending-identity">Sending Identity</Label>
        {selectedIdentity && (
          <Badge variant={selectedIdentity.verified ? "default" : "secondary"}>
            {selectedIdentity.verified ? "Connected" : "Not Connected"}
          </Badge>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading identities...</p>
      ) : identities.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          No sending identities configured. Go to Settings → Sending to add one.
        </div>
      ) : (
        <Select value={value || ""} onValueChange={(val) => onChange(val || null)}>
          <SelectTrigger id="sending-identity">
            <SelectValue placeholder="Select sending identity" />
          </SelectTrigger>
          <SelectContent>
            {identities.map((identity) => (
              <SelectItem key={identity.id} value={identity.id}>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {identity.identity_name || "Unnamed Identity"}
                    </span>
                    {identity.is_primary && (
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    <span>{identity.email_address}</span>
                    <span>•</span>
                    <span>{formatProvider(identity.provider)}</span>
                    {identity.daily_send_limit && (
                      <>
                        <span>•</span>
                        <span>{identity.daily_send_limit}/day</span>
                      </>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {selectedIdentity && (
        <p className="text-xs text-muted-foreground">
          All sequence emails will be sent from{" "}
          <span className="font-medium">{selectedIdentity.email_address}</span>
          {selectedIdentity.identity_name && (
            <>
              {" "}
              ({selectedIdentity.identity_name})
            </>
          )}
        </p>
      )}
    </div>
  );
}




























































