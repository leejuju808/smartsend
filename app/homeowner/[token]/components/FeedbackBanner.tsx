"use client";

// Block 94000 — Micro-Feedback Banner
// Simple 1-10 slider when triggered at key events

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Star, X } from "lucide-react";
import { toast } from "sonner";

interface FeedbackBannerProps {
  portalToken: string;
  jobId: string;
  triggerType: "after_estimate" | "after_install" | "after_cleanup" | "30_day_checkin";
  question: string;
  onSubmitted?: () => void;
}

const triggerQuestions: Record<string, string> = {
  after_estimate: "How clear was your estimate?",
  after_install: "How was the crew and communication?",
  after_cleanup: "How satisfied are you with the final result?",
  "30_day_checkin": "How is your roof holding up so far?",
};

export function FeedbackBanner({
  portalToken,
  jobId,
  triggerType,
  question,
  onSubmitted,
}: FeedbackBannerProps) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1 || rating > 10) {
      toast.error("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/homeowner/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portal_token: portalToken,
          job_id: jobId,
          trigger_type: triggerType,
          rating,
          comment: comment.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      toast.success("Thank you for your feedback!");
      setDismissed(true);
      onSubmitted?.();
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (dismissed) return null;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">
              {question || triggerQuestions[triggerType]}
            </h3>
            <p className="text-sm text-gray-600">
              Your feedback helps us improve. Rate your experience (1-10):
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Rating Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rating: {rating}/10</Label>
              <div className="flex gap-1">
                {[...Array(10)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
            </div>
            <Slider
              value={[rating]}
              onValueChange={([value]) => setRating(value)}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Poor</span>
              <span>Excellent</span>
            </div>
          </div>

          {/* Optional Comment */}
          <div className="space-y-2">
            <Label htmlFor="feedback-comment" className="text-sm">
              Additional Comments (Optional)
            </Label>
            <Textarea
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us more about your experience..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Submit Button */}
          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
