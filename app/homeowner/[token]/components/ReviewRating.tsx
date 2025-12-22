"use client";

// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// Review Rating Component for Homeowner Portal
// Displays rating interface and routes to feedback or Google review based on rating

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { InternalFeedback } from "./InternalFeedback";
import { GoogleReviewPush } from "./GoogleReviewPush";

interface ReviewRatingProps {
  reviewRequestId: string;
  jobId: string;
  homeownerName?: string;
  onComplete?: () => void;
}

type ReviewStage = "rating" | "internal_feedback" | "google_push" | "completed";

export function ReviewRating({
  reviewRequestId,
  jobId,
  homeownerName,
  onComplete,
}: ReviewRatingProps) {
  const [stage, setStage] = useState<ReviewStage>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRatingClick = async (selectedRating: number) => {
    if (submitting) return;

    setRating(selectedRating);
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
          rating: selectedRating,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit rating");
      }

      // Route based on rating
      if (selectedRating <= 3) {
        setStage("internal_feedback");
      } else {
        // Trigger Google push
        await fetch("/api/reviews/google-push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            review_request_id: reviewRequestId,
          }),
        });
        setStage("google_push");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedbackComplete = () => {
    setStage("completed");
    onComplete?.();
  };

  const handleGoogleReviewComplete = () => {
    setStage("completed");
    onComplete?.();
  };

  if (stage === "rating") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            How was your experience?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-600">
            We'd love to hear about your experience with our roofing service.
            Please rate us from 1 to 5 stars.
          </p>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRatingClick(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(null)}
                disabled={submitting}
                className={`
                  text-5xl transition-all transform hover:scale-110
                  ${
                    rating === star || hoveredRating === star
                      ? "text-yellow-400"
                      : "text-gray-300 hover:text-yellow-300"
                  }
                  ${submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                ★
              </button>
            ))}
          </div>

          {submitting && (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Submitting...</span>
            </div>
          )}

          {rating && !submitting && (
            <div className="text-center text-sm text-gray-500">
              {rating === 5 && "Thank you! We're thrilled you had a great experience!"}
              {rating === 4 && "Thank you! We're glad you're happy with our work!"}
              {rating === 3 && "Thank you for your feedback. We'd love to hear more."}
              {rating === 2 && "We're sorry to hear that. Please tell us how we can improve."}
              {rating === 1 && "We're very sorry. Please share your feedback so we can make things right."}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (stage === "internal_feedback" && rating) {
    return (
      <InternalFeedback
        reviewRequestId={reviewRequestId}
        rating={rating}
        homeownerName={homeownerName}
        onComplete={handleFeedbackComplete}
      />
    );
  }

  if (stage === "google_push" && rating) {
    return (
      <GoogleReviewPush
        reviewRequestId={reviewRequestId}
        rating={rating}
        homeownerName={homeownerName}
        onComplete={handleGoogleReviewComplete}
      />
    );
  }

  if (stage === "completed") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h3 className="text-xl font-semibold text-gray-900">
              {rating && rating >= 4
                ? "Thank you for your review!"
                : "Thank you for your feedback"}
            </h3>
            <p className="text-gray-600">
              {rating && rating >= 4
                ? "We really appreciate you taking the time to share your experience. Your feedback helps us grow and helps other homeowners find quality roofing services."
                : "We appreciate your feedback and our team will reach out shortly to make things right."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
































