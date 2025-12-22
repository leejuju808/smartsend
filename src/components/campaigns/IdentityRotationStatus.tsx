/**
 * Block 12100 — Identity Rotation Status Component
 * Shows rotation status and warnings for campaigns
 */

"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { getHealthyIdentities } from "@/lib/identity-rotation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface IdentityRotationStatusProps {
  orgId: string;
  campaignId?: string;
}

export function IdentityRotationStatus({ orgId, campaignId }: IdentityRotationStatusProps) {
  const [healthyCount, setHealthyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadRotationStatus();
  }, [orgId]);

  async function loadRotationStatus() {
    try {
      const identities = await getHealthyIdentities(supabase, orgId);
      setHealthyCount(identities.length);
    } catch (error) {
      console.error("Error loading rotation status:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return null;
  }

  if (healthyCount === null) {
    return null;
  }

  // Only 1 healthy identity - show warning
  if (healthyCount === 1) {
    return (
      <Alert variant="warning" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Rotation Disabled</AlertTitle>
        <AlertDescription>
          Only 1 healthy sending identity available. Rotation is disabled until more identities are added.
          Add more identities in Settings → Sending Identities.
        </AlertDescription>
      </Alert>
    );
  }

  // 2+ healthy identities - show active status
  if (healthyCount >= 2) {
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <RotateCw className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900">Identity Rotation Active</AlertTitle>
        <AlertDescription className="text-green-800">
          Sending across {healthyCount} identities for optimal deliverability.
        </AlertDescription>
      </Alert>
    );
  }

  // No healthy identities
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>No Healthy Identities</AlertTitle>
      <AlertDescription>
        No healthy sending identities available. Please check your identity health status in Settings → Sending Identities.
      </AlertDescription>
    </Alert>
  );
}




























































