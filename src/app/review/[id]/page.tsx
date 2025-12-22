"use client";

// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// Public Review Page - Customer-facing review submission page

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const reviewRequestId = params.id as string;

  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"rating" | "review_links" | "thank_you">(
    "rating"
  );
  const [showReviewLinks, setShowReviewLinks] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string>("");

  const handleRatingSubmit = async (selectedRating: number) => {
    setRating(selectedRating);
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/reviews/handle-response", {
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

      // If 4-5 stars, show review platform links
      if (selectedRating >= 4) {
        setShowReviewLinks(true);
        setStep("review_links");
        
        // Get Google review URL (could be from workspace settings)
        // For now, we'll use a placeholder or fetch from API
        setGoogleReviewUrl("#"); // Replace with actual Google review URL
      } else {
        // 1-3 stars: show thank you message (damage control activated)
        setStep("thank_you");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewLinkClick = async (platform: string) => {
    try {
      await fetch("/api/reviews/track-click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_request_id: reviewRequestId,
          platform: platform,
        }),
      });
    } catch (err) {
      console.error("Error tracking click:", err);
    }
  };

  const handleReviewCompleted = async (platform: string) => {
    try {
      await fetch("/api/reviews/mark-completed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_request_id: reviewRequestId,
          review_platform: platform,
        }),
      });

      setStep("thank_you");
    } catch (err: any) {
      setError(err.message || "Failed to mark review as completed");
    }
  };

  if (step === "rating") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            How was your experience?
          </h1>
          <p className="text-gray-600 mb-8">
            We'd love to hear about your experience. Please rate us from 1 to 5
            stars.
          </p>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-center gap-4 mb-8">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRatingSubmit(star)}
                disabled={submitting}
                className={`
                  text-5xl transition-all transform hover:scale-110
                  ${
                    rating === star
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
            <div className="text-center text-gray-500">Submitting...</div>
          )}
        </div>
      </div>
    );
  }

  if (step === "review_links") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">
              {rating && "★".repeat(rating)}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Thank you!
            </h1>
            <p className="text-gray-600">
              Would you mind leaving a review on one of these platforms? It
              helps local homeowners choose someone they can trust.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={googleReviewUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleReviewLinkClick("google")}
              className="block w-full bg-white border-2 border-gray-300 rounded-lg p-4 hover:border-blue-500 transition-colors text-center font-semibold text-gray-700 hover:text-blue-600"
            >
              📍 Leave a Google Review
            </a>
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleReviewLinkClick("yelp")}
              className="block w-full bg-white border-2 border-gray-300 rounded-lg p-4 hover:border-red-500 transition-colors text-center font-semibold text-gray-700 hover:text-red-600"
            >
              🔍 Leave a Yelp Review
            </a>
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleReviewLinkClick("facebook")}
              className="block w-full bg-white border-2 border-gray-300 rounded-lg p-4 hover:border-blue-600 transition-colors text-center font-semibold text-gray-700 hover:text-blue-700"
            >
              👍 Leave a Facebook Review
            </a>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                handleReviewCompleted("other");
              }}
              className="text-gray-500 hover:text-gray-700 text-sm underline"
            >
              I've already left a review
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "thank_you") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {rating && rating >= 4
              ? "Thank you for your review!"
              : "Thank you for your feedback"}
          </h1>
          <p className="text-gray-600 mb-6">
            {rating && rating >= 4
              ? "We really appreciate you taking the time to share your experience. Your feedback helps us grow and helps other homeowners find quality roofing services."
              : "We appreciate your feedback and our team will reach out shortly to make things right."}
          </p>
          {rating === 5 && (
            <p className="text-sm text-gray-500 mb-4">
              Know someone else who needs roofing help? Refer them and we'll
              give them priority scheduling!
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
































