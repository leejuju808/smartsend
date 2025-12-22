"use client";
import { useState, useEffect } from "react";

interface StarRaterProps {
  templateId: string;
  initialRating?: number;
}

export default function StarRater({ templateId, initialRating = 0 }: StarRaterProps) {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load existing rating if user has rated this template
    loadExistingRating();
  }, [templateId]);

  const loadExistingRating = async () => {
    try {
      const res = await fetch(`/api/templates/${templateId}/rating`);
      if (res.ok) {
        const data = await res.json();
        if (data.ratings && data.ratings.length > 0) {
          // Find user's rating (assuming we can identify the current user's rating)
          // For now, we'll just show the first rating as a placeholder
          // In a real implementation, you'd filter by current user ID
        }
      }
    } catch (error) {
      console.error('Failed to load rating:', error);
    }
  };

  const submitRating = async (stars: number) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars, comment: null })
      });
      
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || "Failed to submit rating");
      } else {
        setRating(stars);
        setMessage("Thanks for rating!");
        setTimeout(() => setMessage(undefined), 3000);
      }
    } catch (error) {
      setMessage("Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStarClick = (stars: number) => {
    if (submitting) return;
    submitRating(stars);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700">Rate this template</div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleStarClick(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            disabled={submitting}
            className={`
              text-2xl transition-colors disabled:opacity-50
              ${(hoverRating || rating) >= star 
                ? 'text-yellow-400 hover:text-yellow-500' 
                : 'text-gray-300 hover:text-yellow-400'
              }
            `}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-gray-600">
          {rating > 0 && `${rating}/5`}
        </span>
      </div>
      {message && (
        <div className={`text-sm ${message.includes('Thanks') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </div>
      )}
    </div>
  );
} 