// Block 28844 — Quote Detail Modal Component
// Shows quote details with revival timeline

"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface RevivalEvent {
  id: string;
  type: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  replied_at: string | null;
  message: string | null;
}

interface Props {
  quoteId: string;
  onClose: () => void;
}

export default function QuoteDetailModal({ quoteId, onClose }: Props) {
  const [events, setEvents] = useState<RevivalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevivalEvents();
  }, [quoteId]);

  const fetchRevivalEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/quotes/revival/events?quote_id=${quoteId}`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (error) {
      console.error("Error fetching revival events:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "check_in_3":
        return "Day 3: Quick Check-In";
      case "check_in_6":
        return "Day 6: Options Discussion";
      case "offer":
        return "Day 9: Price Drop Offer";
      case "final":
        return "Day 14: Final Check-In";
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Scheduled</span>;
      case "sent":
        return <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Sent</span>;
      case "replied":
        return <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Replied</span>;
      case "cancelled":
        return <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Cancelled</span>;
      default:
        return <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-semibold">Quote Revival Timeline</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No revival events scheduled yet. Events are automatically scheduled when a quote becomes stalled.
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event, index) => (
                <div key={event.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-800">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{getEventTypeLabel(event.type)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Scheduled: {new Date(event.scheduled_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(event.status)}
                  </div>

                  {event.sent_at && (
                    <div className="text-xs text-gray-600 mt-2">
                      Sent: {new Date(event.sent_at).toLocaleString()}
                    </div>
                  )}

                  {event.replied_at && (
                    <div className="text-xs text-green-600 mt-2">
                      Replied: {new Date(event.replied_at).toLocaleString()}
                    </div>
                  )}

                  {event.message && (
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                      {event.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


































