"use client";

// Block 83000 — SmartSend Roofing Homeowner Portal v1
// Public Homeowner Portal Page (Token-Based Access)

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Star, Calendar, MapPin, CheckCircle2, Clock, Wrench } from "lucide-react";

interface PortalData {
  portal: {
    id: string;
    homeowner_name: string | null;
    homeowner_email: string | null;
  };
  job: {
    id: string;
    title: string | null;
    status: string;
    scheduled_start_date: string | null;
    scheduled_end_date: string | null;
    address: string | null;
  };
  events: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string | null;
    created_at: string;
  }>;
  files: Array<{
    id: string;
    file_url: string;
    label: string;
    file_name: string | null;
    uploaded_at: string;
  }>;
  photos: Array<{
    id: string;
    photo_url: string;
    category: string;
    caption: string | null;
    created_at: string;
  }>;
  crew: any;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  unscheduled: { label: "Unscheduled", color: "bg-gray-100 text-gray-800", icon: Clock },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-800", icon: Calendar },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-800", icon: Wrench },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
};

const PHOTO_CATEGORIES = ["All", "Before", "Damage", "During", "After"];

export default function HomeownerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoCategory, setSelectedPhotoCategory] = useState("All");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [feedback, setFeedback] = useState({ rating: 0, comment: "", willing_to_review: false });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => {
      setToken(p.token);
      loadPortalData(p.token);
    });
  }, [params]);

  async function loadPortalData(portalToken: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/portal/${portalToken}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Portal not found");
      }
      const portalData = await res.json();
      setData(portalData);
    } catch (e: any) {
      console.error("Error loading portal:", e);
      setError(e.message || "Failed to load portal");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (feedback.rating === 0 || !token) {
      alert("Please select a rating");
      return;
    }

    setSubmittingFeedback(true);
    try {
      const res = await fetch(`/api/portal/${token}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit feedback");
      }

      setFeedbackSubmitted(true);
      setFeedback({ rating: 0, comment: "", willing_to_review: false });
    } catch (e: any) {
      console.error("Error submitting feedback:", e);
      alert(e.message || "Failed to submit feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Loading your project portal...</div>
          <div className="text-sm text-gray-600">Please wait</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <div className="text-lg font-medium text-red-600 mb-2">Portal Not Found</div>
            <div className="text-sm text-gray-600">
              {error || "This portal link is invalid or has been deactivated."}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[data.job.status] || STATUS_CONFIG.unscheduled;
  const StatusIcon = statusConfig.icon;

  const filteredPhotos = selectedPhotoCategory === "All"
    ? data.photos
    : data.photos.filter((p) => p.category.toLowerCase() === selectedPhotoCategory.toLowerCase());

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold mb-2">Your Roof Project</h1>
          {data.job.address && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="w-4 h-4 mr-1" />
              {data.job.address}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Status Banner */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <StatusIcon className={`w-6 h-6 ${statusConfig.color.split(" ")[1]}`} />
              <div>
                <div className="text-sm font-medium text-gray-600">Current Status</div>
                <div className={`text-xl font-semibold ${statusConfig.color.split(" ")[1]}`}>
                  {statusConfig.label}
                </div>
              </div>
            </div>
          </div>

          {data.job.status === "scheduled" && data.job.scheduled_start_date && (
            <div className="text-sm text-gray-600">
              Scheduled for: {new Date(data.job.scheduled_start_date).toLocaleDateString()}
            </div>
          )}

          {data.job.status === "in_progress" && (
            <div className="text-sm text-gray-600">
              Our crew is on-site completing your roof replacement.
            </div>
          )}

          {data.job.status === "completed" && (
            <div className="text-sm text-gray-600">
              Your roof project has been completed. Thank you for choosing us!
            </div>
          )}
        </Card>

        {/* Timeline */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Project Timeline</h2>
          <div className="space-y-4">
            {data.events.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No events yet. Updates will appear here as your project progresses.
              </div>
            ) : (
              data.events.map((event) => (
                <div key={event.id} className="flex gap-4">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
                  <div className="flex-1">
                    <div className="font-medium">{event.title}</div>
                    {event.description && (
                      <div className="text-sm text-gray-600 mt-1">{event.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Photos */}
        {data.photos.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Photo Gallery</h2>
            
            {/* Category Filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {PHOTO_CATEGORIES.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedPhotoCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedPhotoCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>

            {/* Photo Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition"
                  onClick={() => setSelectedPhoto(photo.photo_url)}
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || "Project photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Documents */}
        {data.files.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Documents</h2>
            <div className="space-y-2">
              {data.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{file.label}</div>
                    {file.file_name && (
                      <div className="text-sm text-gray-600">{file.file_name}</div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(file.file_url, "_blank")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Feedback */}
        {data.job.status === "completed" && !feedbackSubmitted && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">How did we do?</h2>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Rating</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setFeedback({ ...feedback, rating })}
                      className={`p-2 rounded ${
                        feedback.rating >= rating
                          ? "bg-yellow-400 text-yellow-900"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      <Star className="w-5 h-5 fill-current" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Tell us about your experience
                </label>
                <textarea
                  className="w-full p-3 border rounded-lg"
                  rows={4}
                  value={feedback.comment}
                  onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                  placeholder="Share your feedback..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="willing_to_review"
                  checked={feedback.willing_to_review}
                  onChange={(e) =>
                    setFeedback({ ...feedback, willing_to_review: e.target.checked })
                  }
                />
                <label htmlFor="willing_to_review" className="text-sm">
                  Yes, you can send me a link to leave a Google review
                </label>
              </div>

              <Button
                onClick={submitFeedback}
                disabled={submittingFeedback || feedback.rating === 0}
                className="w-full"
              >
                {submittingFeedback ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          </Card>
        )}

        {feedbackSubmitted && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="text-center">
              <div className="text-lg font-medium text-green-800 mb-2">
                Thank you for your feedback!
              </div>
              <div className="text-sm text-green-600">
                We appreciate you taking the time to share your experience.
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <img
            src={selectedPhoto}
            alt="Project photo"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}



























