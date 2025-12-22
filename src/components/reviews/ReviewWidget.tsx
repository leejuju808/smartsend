"use client";

// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// Review Widget Component - For embedding on landing pages

import { useEffect, useState } from "react";
import { Star, ExternalLink } from "lucide-react";

interface ReviewWidgetProps {
  workspaceId?: string;
  googleReviewUrl?: string;
  yelpReviewUrl?: string;
  facebookReviewUrl?: string;
  showRecentReviews?: boolean;
  maxReviews?: number;
}

interface ReviewData {
  avg_rating?: number;
  total_reviews?: number;
  recent_reviews?: Array<{
    rating: number;
    lead_name?: string;
    completed_at?: string;
    review_platform?: string;
  }>;
}

export default function ReviewWidget({
  workspaceId,
  googleReviewUrl,
  yelpReviewUrl,
  facebookReviewUrl,
  showRecentReviews = true,
  maxReviews = 5,
}: ReviewWidgetProps) {
  const [reviewData, setReviewData] = useState<ReviewData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceId) {
      fetchReviewData();
    }
  }, [workspaceId]);

  const fetchReviewData = async () => {
    try {
      const response = await fetch(
        `/api/reviews/widget?workspace_id=${workspaceId}&limit=${maxReviews}`
      );
      if (response.ok) {
        const data = await response.json();
        setReviewData(data);
      }
    } catch (error) {
      console.error("Error fetching review data:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* Header with Average Rating */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Customer Reviews</h3>
          <div className="flex items-center gap-3">
            {reviewData.avg_rating && (
              <>
                <div className="text-4xl font-bold text-gray-900">
                  {reviewData.avg_rating.toFixed(1)}
                </div>
                <div>
                  {reviewData.avg_rating && renderStars(Math.round(reviewData.avg_rating))}
                  <p className="text-sm text-gray-600 mt-1">
                    Based on {reviewData.total_reviews || 0} reviews
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Review Platform Links */}
      {(googleReviewUrl || yelpReviewUrl || facebookReviewUrl) && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">Leave us a review:</p>
          <div className="flex flex-wrap gap-3">
            {googleReviewUrl && (
              <a
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <span>Google</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {yelpReviewUrl && (
              <a
                href={yelpReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                <span>Yelp</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {facebookReviewUrl && (
              <a
                href={facebookReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
              >
                <span>Facebook</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Recent Reviews */}
      {showRecentReviews && reviewData.recent_reviews && reviewData.recent_reviews.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-gray-900">Recent Reviews</h4>
          {reviewData.recent_reviews.slice(0, maxReviews).map((review, index) => (
            <div key={index} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                {renderStars(review.rating)}
                <span className="text-xs text-gray-500 capitalize">
                  {review.review_platform || "Verified"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {review.lead_name || "Anonymous Customer"}
                {review.completed_at && (
                  <span className="text-gray-400 ml-2">
                    • {new Date(review.completed_at).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
































