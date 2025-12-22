"use client";
import { useState, useEffect } from "react";

interface Rating {
  stars: number;
  comment?: string;
  created_at: string;
  user_id: string;
}

export default function StarRater({ templateId }: { templateId: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRatings();
  }, [templateId]);

  async function loadRatings() {
    try {
      const res = await fetch(`/api/marketplace/templates/${templateId}/rating`);
      if (res.ok) {
        const data = await res.json();
        setRatings(data.ratings || []);
      }
    } catch (error) {
      console.error("Failed to load ratings:", error);
    }
  }

  async function submitRating() {
    if (rating === 0) return;
    
    setLoading(true);
    setMessage("");
    
    try {
      const res = await fetch(`/api/marketplace/templates/${templateId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: rating, comment: comment.trim() || null })
      });
      
      if (res.ok) {
        setMessage("Thanks for rating!");
        setComment("");
        await loadRatings(); // Refresh ratings
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to submit rating");
      }
    } catch (error) {
      setMessage("Failed to submit rating");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Rate this template:</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`text-xl transition-colors ${
                rating >= star ? "text-yellow-400" : "text-gray-300 hover:text-yellow-200"
              }`}
            >
              ★
            </button>
          ))}
        </div>
        {rating > 0 && (
          <span className="text-sm text-gray-600">({rating} star{rating !== 1 ? 's' : ''})</span>
        )}
      </div>
      
      {rating > 0 && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a comment (optional)"
            className="w-full rounded-lg border p-2 text-sm"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submitRating}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Rating"}
            </button>
            {message && (
              <span className={`text-sm ${message.includes("Thanks") ? "text-green-600" : "text-red-600"}`}>
                {message}
              </span>
            )}
          </div>
        </div>
      )}

      {ratings.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium mb-3">Recent Ratings</h3>
          <div className="space-y-3">
            {ratings.slice(0, 5).map((r, i) => (
              <div key={i} className="rounded-lg border p-3 bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex text-yellow-400">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={i < r.stars ? "text-yellow-400" : "text-gray-300"}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-700">{r.comment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 