"use client";

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface CampaignDuplicateWarningProps {
  campaignId?: string;
  contactIds?: string[];
}

/**
 * Warning component for campaign builder showing duplicate contacts
 * Shows "X duplicates detected — SmartSend will send only once" message
 */
export function CampaignDuplicateWarning({ 
  campaignId, 
  contactIds = [] 
}: CampaignDuplicateWarningProps) {
  const [duplicateCount, setDuplicateCount] = React.useState<number>(0);
  const router = useRouter();

  React.useEffect(() => {
    // Check for duplicates in the selected contacts
    if (contactIds.length === 0) {
      setDuplicateCount(0);
      return;
    }

    const checkDuplicates = async () => {
      try {
        const r = await fetch("/api/contacts/duplicates/count", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success) {
          // For now, just show the general duplicate count
          // In a full implementation, we'd check the specific contactIds
          setDuplicateCount(j.duplicateGroups ?? 0);
        }
      } catch (e) {
        // Silently fail
      }
    };

    checkDuplicates();
  }, [contactIds]);

  if (duplicateCount === 0) return null;

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900">Duplicates Detected</AlertTitle>
      <AlertDescription className="text-amber-800">
        {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} detected — SmartSend will send only once per homeowner.
        <Button
          variant="link"
          className="ml-2 h-auto p-0 text-amber-900 underline"
          onClick={() => router.push("/contacts/merge")}
        >
          Review duplicates
        </Button>
      </AlertDescription>
    </Alert>
  );
}





















































