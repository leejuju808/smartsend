"use client";

// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// Internal Feedback Component
// Collects private feedback for 1-3 star ratings to prevent negative Google reviews

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Loader2, AlertCircle } from "lucide-react";

interface InternalFeedbackProps {
  reviewRequestId: string;
  rating: number;
  homeownerName?: string;
  onComplete?: () => void;
}

export function InternalFeedback({
  reviewRequestId,
  rating,
  homeownerName,
  onComplete,
}: InternalFeedbackProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      setError("Please share your feedback so we can improve.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/reviews/submit-rating", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_request_id: reviewRequestId,
          rating,
          feedback,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSubmitted(true);
      setTimeout(() => {
        onComplete?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-orange-500 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-900">
              Thank you for your feedback
            </h3>
            <p className="text-gray-600">
              We're sorry to hear about your experience. Our team will review your
              feedback and reach out to you shortly to make things right.
            </p>
            <p className="text-sm text-gray-500">
              Your feedback has been sent directly to our team and will not be
              posted publicly.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-orange-500" />
          Tell us what went wrong
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-gray-600">
          We're sorry to hear about your experience. Please share your feedback
          so we can improve and make things right. Your feedback will be sent
          directly to our team and will not be posted publicly.
        </p>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="feedback" className="text-sm font-medium text-gray-700">
            Your feedback
          </label>
          <Textarea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Please tell us what we could have done better..."
            rows={5}
            className="w-full"
          />
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={submitting || !feedback.trim()}
            className="flex-1"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Feedback"
            )}
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Your feedback is private and will only be seen by our team.
        </p>
      </CardContent>
    </Card>
  );
}
































