"use client";

// Block 16800 — Step 5: Book Your First Inspection (Milestone)

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CheckCircle2, Mail, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";

export function OnboardingStep5({
  onComplete,
}: {
  onComplete: (data: any) => void;
}) {
  const [inspectionBooked, setInspectionBooked] = useState(false);
  const [hasReplies, setHasReplies] = useState(false);

  useEffect(() => {
    checkForReplies();
    const interval = setInterval(checkForReplies, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const checkForReplies = async () => {
    try {
      // Check if there are any replies
      const res = await fetch("/api/replies?limit=1");
      if (res.ok) {
        const data = await res.json();
        if (data.replies && data.replies.length > 0) {
          setHasReplies(true);
          
          // Record milestone for first reply
          await fetch("/api/onboarding/v2/milestones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              milestone_type: "win_5_first_reply",
            }),
          });
        }
      }
    } catch (error) {
      console.error("Error checking replies:", error);
    }
  };

  const handleInspectionBooked = async () => {
    setInspectionBooked(true);

    try {
      await fetch("/api/onboarding/v2/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 5,
          stepData: {
            step_5_inspection_booked: true,
          },
          win: "win_6_first_booking",
        }),
      });

      // Complete onboarding
      await fetch("/api/onboarding/v2/complete", { method: "POST" });

      onComplete({ inspection_booked: true });
    } catch (error) {
      console.error("Error saving step 5:", error);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          <CardTitle className="text-2xl">Step 5: Book Your First Inspection</CardTitle>
        </div>
        <CardDescription>
          Your goal: Book your first inspection. You're 1 step away from seeing homeowner replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!inspectionBooked ? (
          <>
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border border-yellow-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-400">
                  Milestone: Book Your First Inspection
                </h3>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                This is the conversion high point. When an inspection is booked, you'll see onboarding success fireworks!
              </p>
            </div>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Check Your Inbox
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  See new homeowner replies and respond with AI suggestions.
                </p>
                <Link href="/dashboard/replies">
                  <Button variant="outline" size="sm">
                    View Inbox →
                  </Button>
                </Link>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Send Booking Link
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect your scheduler and send booking links to interested homeowners.
                </p>
                <Link href="/dashboard/settings/scheduler">
                  <Button variant="outline" size="sm">
                    Connect Scheduler →
                  </Button>
                </Link>
              </div>

              {hasReplies && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <h3 className="font-semibold text-green-800 dark:text-green-400">
                      You Have Replies!
                    </h3>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Homeowners are responding. Check your inbox and send them a booking link.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleInspectionBooked}>
                I've Booked My First Inspection 🎉
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gradient-to-r from-green-50 to-yellow-50 dark:from-green-950/20 dark:to-yellow-950/20 border border-green-200 rounded-lg p-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <Trophy className="h-16 w-16 text-yellow-500" />
                  <Sparkles className="h-8 w-8 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">🎉 Onboarding Complete!</h2>
              <p className="text-muted-foreground mb-6">
                You've booked your first inspection. This is when you decide to PAY and become a paying customer.
              </p>
              <Link href="/dashboard">
                <Button size="lg">
                  Go to Dashboard →
                </Button>
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}





















































