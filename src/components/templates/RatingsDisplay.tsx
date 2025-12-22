"use client";
import { useState, useEffect } from "react";

interface Rating {
  id: string;
  stars: number;
  comment?: string;
  created_at: string;
  user_id: string;
}

interface RatingsDisplayProps {
  templateId: string;
}

export default function RatingsDisplay({ templateId }: RatingsDisplayProps) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRatings();
  }, [templateId]);

  const loadRatings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/templates/${templateId}/rating`);
      if (res.ok) {
        const data = await res.json();
        setRatings(data.ratings || []);
      } else {
        setError('Failed to load ratings');
      }
    } catch (error) {
      setError('Failed to load ratings');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Ratings & Reviews</h3>
        <div className="text-gray-500">Loading ratings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Ratings & Reviews</h3>
        <div className="text-red-500">{error}</div>
        <button 
          onClick={loadRatings}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Ratings & Reviews ({ratings.length})
      </h3>
      
      {ratings.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No ratings yet. Be the first to rate this template!
        </div>
      ) : (
        <div className="space-y-4">
          {ratings.map((rating) => (
            <div key={rating.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={i < rating.stars ? 'text-yellow-400' : 'text-gray-300'}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {rating.stars}/5
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(rating.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {rating.comment && (
                <div className="text-sm text-gray-700 mt-2">
                  {rating.comment}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 