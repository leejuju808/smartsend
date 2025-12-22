"use client";

// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// Google Review Push Component
// Displays Google review link and testimonial collection for 4-5 star ratings

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, ExternalLink, Loader2, CheckCircle2, Camera, Upload } from "lucide-react";

interface GoogleReviewPushProps {
  reviewRequestId: string;
  rating: number;
  homeownerName?: string;
  onComplete?: () => void;
}

export function GoogleReviewPush({
  reviewRequestId,
  rating,
  homeownerName,
  onComplete,
}: GoogleReviewPushProps) {
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [testimonial, setTestimonial] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [testimonialSubmitted, setTestimonialSubmitted] = useState(false);

  useEffect(() => {
    // Fetch Google review URL
    fetch("/api/reviews/google-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        review_request_id: reviewRequestId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.google_review_url) {
          setGoogleReviewUrl(data.google_review_url);
        }
      })
      .catch((err) => {
        console.error("Error fetching Google review URL:", err);
      });
  }, [reviewRequestId]);

  const handleReviewClick = () => {
    if (googleReviewUrl) {
      window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
      setReviewSubmitted(true);
    }
  };

  const handleTestimonialSubmit = async () => {
    if (!testimonial.trim()) {
      setError("Please share your testimonial.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/reviews/store-testimonial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_request_id: reviewRequestId,
          content: testimonial,
          rating,
          homeowner_name: homeownerName,
          photo_url: photoUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to store testimonial");
      }

      setTestimonialSubmitted(true);
      setTimeout(() => {
        onComplete?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // TODO: Upload to Supabase Storage and get URL
      // For now, just store the file reference
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (reviewSubmitted && testimonialSubmitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h3 className="text-xl font-semibold text-gray-900">
              Thank you so much!
            </h3>
            <p className="text-gray-600">
              We really appreciate you taking the time to share your experience.
              Your feedback helps us grow and helps other homeowners find quality
              roofing services.
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
          <Star className="h-5 w-5 text-yellow-500" />
          Thank you! Please leave a review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">
            {"★".repeat(rating)}
          </div>
          <p className="text-gray-600">
            Your feedback means the world to us! Could you please leave a quick
            review on Google? It helps our small business grow.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {googleReviewUrl && (
          <Button
            onClick={handleReviewClick}
            className="w-full"
            size="lg"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Leave Review on Google
          </Button>
        )}

        {!googleReviewUrl && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            Loading Google review link...
          </div>
        )}

        {reviewSubmitted && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            ✓ Thank you for leaving a review!
          </div>
        )}

        <div className="border-t pt-6 space-y-4">
          <h4 className="font-semibold text-gray-900">
            Can we feature your review on our website?
          </h4>
          <p className="text-sm text-gray-600">
            Share your testimonial and optionally upload a photo of your new roof.
            We'll use it to help other homeowners see the quality of our work.
          </p>

          <div className="space-y-2">
            <label htmlFor="testimonial" className="text-sm font-medium text-gray-700">
              Your testimonial
            </label>
            <Textarea
              id="testimonial"
              value={testimonial}
              onChange={(e) => setTestimonial(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="photo" className="text-sm font-medium text-gray-700">
              Upload a photo (optional)
            </label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="photo"
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <Camera className="h-4 w-4" />
                <span className="text-sm">Choose Photo</span>
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              {photoUrl && (
                <span className="text-sm text-gray-600">Photo selected</span>
              )}
            </div>
          </div>

          <Button
            onClick={handleTestimonialSubmit}
            disabled={submitting || !testimonial.trim()}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Testimonial"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
































