"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Step7LaunchProps {
  onComplete: (campaignId: string) => void;
  onBack: () => void;
  state: any;
}

export function Step7Launch({ onComplete, onBack, state }: Step7LaunchProps) {
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const res = await fetch("/api/onboarding/launch-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: `My First Campaign - ${new Date().toLocaleDateString()}`,
          templateId: state.data.templateId,
          sendingIdentityId: state.data.sendingIdentityId,
          contactIds: state.data.contacts?.map((c: any) => c.id).filter(Boolean) || [],
          personalizationData: state.data.personalizationData || {},
          schedule: state.data.schedule || { immediate: true },
          dailySendCap: state.data.dailySendCap || 50,
          sendingWindowStart: state.data.schedule?.timeWindow?.start || "09:00",
          sendingWindowEnd: state.data.schedule?.timeWindow?.end || "17:00",
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to launch campaign");
      }

      const data = await res.json();
      toast.success("Campaign launched successfully!");
      onComplete(data.campaignId);
    } catch (error: any) {
      toast.error(error.message || "Failed to launch campaign");
      setLaunching(false);
    }
  };

  const contactCount = state.data.contacts?.length || 0;
  const firstBatchSize = Math.min(contactCount, state.data.dailySendCap || 50);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Ready to Launch! 🎉</h2>
        <p className="text-gray-600">
          Review the summary below and launch your first campaign
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Final Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Sending identity connected</p>
                <p className="text-sm text-muted-foreground">
                  {state.data.sendingIdentityId ? "Ready to send" : "Not set"}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">{contactCount} homeowner contacts added</p>
                <p className="text-sm text-muted-foreground">
                  Tagged as "onboarding_campaign"
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">Campaign template ready</p>
                <p className="text-sm text-muted-foreground">
                  Personalization applied to all steps
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">First {firstBatchSize} emails sending</p>
                <p className="text-sm text-muted-foreground">
                  {state.data.schedule?.immediate
                    ? "Starting immediately"
                    : `Scheduled for ${state.data.schedule?.startDate || "today"}`}
                  {" "}at {state.data.schedule?.timeWindow?.start || "09:00"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <Rocket className="w-12 h-12 mx-auto text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold mb-2">You're all set!</h3>
              <p className="text-sm text-muted-foreground">
                Click "Launch Campaign" to start sending your first roofing outreach campaign.
                You'll be redirected to the campaign dashboard to track progress.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button onClick={onBack} variant="outline" disabled={launching}>
          Back
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={launching}
          size="lg"
          className="px-8"
        >
          {launching ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" />
              Launch Campaign
            </>
          )}
        </Button>
      </div>
    </div>
  );
}




























































