"use client";

// Block 16800 — Step 4: Launch Your First Campaign (Guided)

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";

export function OnboardingStep4({
  onComplete,
}: {
  onComplete: (data: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [campaignSent, setCampaignSent] = useState(false);

  useEffect(() => {
    // Ensure the loading skeleton never shows for this step.
    setLoading(false);
  }, []);

  const handleCampaignSent = async () => {
    setCampaignSent(true);
    
    try {
      await fetch("/api/onboarding/v2/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          stepData: {
            step_4_campaign_sent: true,
          },
          win: "win_3_campaign_sent",
        }),
      });

      onComplete({ campaign_sent: true });
    } catch (error) {
      console.error("Error saving step 4:", error);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Rocket className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl">Step 4: Send</CardTitle>
        </div>
        <CardDescription>
          Your first campaign is already written. Follow-ups are on. Safe limits are set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!campaignSent ? (
          <>
            <div className="space-y-4">
              <div className="border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Storm Check — Free Roof Inspection</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  SmartSend will email homeowners in your city who are likely to need roof work, follow up automatically, and surface the ones who want an estimate.
                </p>
                <Link href="/campaigns/new/from-template/storm-check-free-roof-inspection-v1">
                  <Button>Open done-for-you campaign →</Button>
                </Link>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Locked defaults:</strong> Campaign copy is prewritten, follow-ups are active, and limits are set to keep you safe.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleCampaignSent} variant="outline">
                I’ve started sending →
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-800 dark:text-green-400">
                  Campaign Sent Successfully!
                </h3>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300">
                SmartSend is running. Check Replies for homeowner responses.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={() => onComplete({ campaign_sent: true })}>
                Continue to Book Inspection →
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}





















































