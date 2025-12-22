"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Homeowner Satisfaction Pulse Component

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/src/components/ui/Textarea";
import { Smile, Meh, Frown, CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";

interface SatisfactionPulseProps {
  token: string;
}

export function SatisfactionPulse({ token }: SatisfactionPulseProps) {
  const [selectedLevel, setSelectedLevel] = useState<
    "good" | "concern" | "needs_attention" | null
  >(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!selectedLevel) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/homeowner/satisfaction/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          satisfaction_level: selectedLevel,
          feedback_text: feedback.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSubmitted(true);
      } else {
        alert("Failed to submit feedback. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting satisfaction:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Thank you for your feedback!</p>
            <p className="text-sm text-muted-foreground">
              {selectedLevel === "good"
                ? "We're glad everything looks good!"
                : "We've received your concern and will address it promptly."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How's Everything Looking?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quick check-in: How are things going with your roof project?
        </p>

        <div className="grid grid-cols-3 gap-3">
          <Button
            variant={selectedLevel === "good" ? "default" : "outline"}
            className="h-24 flex flex-col items-center gap-2"
            onClick={() => setSelectedLevel("good")}
          >
            <Smile className="h-8 w-8" />
            <span className="text-sm">Everything looks good</span>
          </Button>

          <Button
            variant={selectedLevel === "concern" ? "default" : "outline"}
            className="h-24 flex flex-col items-center gap-2"
            onClick={() => setSelectedLevel("concern")}
          >
            <Meh className="h-8 w-8" />
            <span className="text-sm">I have a concern</span>
          </Button>

          <Button
            variant={selectedLevel === "needs_attention" ? "default" : "outline"}
            className="h-24 flex flex-col items-center gap-2"
            onClick={() => setSelectedLevel("needs_attention")}
          >
            <Frown className="h-8 w-8" />
            <span className="text-sm">Something needs attention</span>
          </Button>
        </div>

        {(selectedLevel === "concern" || selectedLevel === "needs_attention") && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Please tell us more (optional)
            </label>
            <Textarea
              placeholder="What can we help with?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {selectedLevel && (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}




























