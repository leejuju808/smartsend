"use client";

// Block 49000 — SmartSend Roofing Safety Compliance v1
// Safety Checklist Modal Component
// Shows when crew tries to start a job without completing safety checklist

import { useState, useEffect } from "react";
import { X, Camera, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ChecklistItem {
  id: string;
  question: string;
  required: boolean;
  photo_required: boolean;
  category: string;
  answer?: "yes" | "no" | null;
  notes?: string;
  photo_url?: string;
}

interface SafetyChecklistModalProps {
  jobId: string;
  memberId: string;
  crewId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function SafetyChecklistModal({
  jobId,
  memberId,
  crewId,
  onComplete,
  onCancel,
}: SafetyChecklistModalProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [weather, setWeather] = useState<any>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTemplate();
    loadWeather();
  }, []);

  const loadTemplate = async () => {
    try {
      const response = await fetch("/api/safety/templates?template_type=pre_start_checklist");
      const data = await response.json();
      
      if (data.success && data.templates.length > 0) {
        // Use the first template (usually the default fall protection checklist)
        const template = data.templates[0];
        const items = template.items.map((item: any) => ({
          ...item,
          answer: null,
          notes: "",
          photo_url: null,
        }));
        setChecklist(items);
      } else {
        // Fallback to default checklist structure
        setChecklist([
          {
            id: "harness_check",
            question: "Is safety harness inspected and properly worn?",
            required: true,
            photo_required: true,
            category: "harness",
            answer: null,
            notes: "",
          },
          {
            id: "ladder_secured",
            question: "Is ladder properly secured and positioned?",
            required: true,
            photo_required: true,
            category: "ladder",
            answer: null,
            notes: "",
          },
          {
            id: "ppe_worn",
            question: "Is all required PPE (hard hat, safety glasses, gloves) being worn?",
            required: true,
            photo_required: false,
            category: "ppe",
            answer: null,
            notes: "",
          },
          {
            id: "weather_review",
            question: "Has weather been reviewed? (wind < 25mph, no ice/rain)",
            required: true,
            photo_required: false,
            category: "weather",
            answer: null,
            notes: "",
          },
          {
            id: "open_edges",
            question: "Are all open edges protected with warning lines or guardrails?",
            required: true,
            photo_required: true,
            category: "edge_protection",
            answer: null,
            notes: "",
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading safety template:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeather = async () => {
    // TODO: Integrate with weather API
    setWeather({
      temperature: null,
      wind_speed: null,
      conditions: null,
    });
  };

  const handleAnswer = (itemId: string, answer: "yes" | "no") => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, answer } : item
      )
    );
  };

  const handleNotes = (itemId: string, notes: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, notes } : item
      )
    );
  };

  const handlePhotoUpload = async (itemId: string, file: File) => {
    try {
      // TODO: Upload photo to Supabase Storage
      // For now, create a data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const photoUrl = e.target?.result as string;
        setPhotos((prev) => ({ ...prev, [itemId]: photoUrl }));
        setChecklist((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, photo_url: photoUrl } : item
          )
        );
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo. Please try again.");
    }
  };

  const handleSubmit = async () => {
    // Validate required items
    const requiredItems = checklist.filter((item) => item.required);
    const unansweredRequired = requiredItems.filter(
      (item) => !item.answer || item.answer === null
    );

    if (unansweredRequired.length > 0) {
      alert("Please answer all required questions before submitting.");
      return;
    }

    // Check for required photos
    const requiredPhotos = checklist.filter(
      (item) => item.photo_required && !item.photo_url
    );
    if (requiredPhotos.length > 0) {
      alert("Please upload all required photos before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      // Prepare checklist data
      const checklistData = checklist.map((item) => ({
        id: item.id,
        question: item.question,
        required: item.required,
        photo_required: item.photo_required,
        category: item.category,
        answer: item.answer,
        notes: item.notes || "",
        photo_url: item.photo_url || null,
      }));

      // Prepare photos array
      const photosArray = checklist
        .filter((item) => item.photo_url)
        .map((item) => ({
          category: item.category,
          url: item.photo_url!,
          description: item.question,
        }));

      const response = await fetch("/api/safety/submit-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          crew_id: crewId,
          member_id: memberId,
          checklist: checklistData,
          weather: weather,
          photos: photosArray,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onComplete();
      } else {
        alert(data.error || "Failed to submit safety checklist. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting safety checklist:", error);
      alert("Failed to submit safety checklist. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    checklist.length > 0 &&
    checklist
      .filter((item) => item.required)
      .every((item) => item.answer !== null && item.answer !== undefined) &&
    checklist
      .filter((item) => item.photo_required)
      .every((item) => item.photo_url);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="text-center">Loading safety checklist...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Complete Safety Checklist
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Required before starting this job
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Safety First:</strong> This checklist protects you, your crew,
              and the company. All required items must be completed before starting work.
            </div>
          </div>

          {checklist.map((item) => (
            <div
              key={item.id}
              className="border border-gray-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900">
                    {item.question}
                    {item.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => handleAnswer(item.id, "yes")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                    item.answer === "yes"
                      ? "bg-green-50 border-green-500 text-green-700"
                      : "bg-white border-gray-300 text-gray-700 hover:border-green-300"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => handleAnswer(item.id, "no")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                    item.answer === "no"
                      ? "bg-red-50 border-red-500 text-red-700"
                      : "bg-white border-gray-300 text-gray-700 hover:border-red-300"
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  No
                </button>
              </div>

              {item.answer === "no" && (
                <div className="mt-2">
                  <textarea
                    placeholder="Please explain why this item is marked 'No'..."
                    value={item.notes || ""}
                    onChange={(e) => handleNotes(item.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    rows={2}
                  />
                </div>
              )}

              {item.photo_required && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Required Photo: {item.category}
                  </label>
                  {item.photo_url ? (
                    <div className="relative">
                      <img
                        src={item.photo_url}
                        alt={item.category}
                        className="w-full h-48 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotos((prev) => {
                            const newPhotos = { ...prev };
                            delete newPhotos[item.id];
                            return newPhotos;
                          });
                          setChecklist((prev) =>
                            prev.map((i) =>
                              i.id === item.id ? { ...i, photo_url: undefined } : i
                            )
                          );
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
                      <Camera className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        Take Photo
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePhotoUpload(item.id, file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-4 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`px-6 py-2 rounded-lg font-medium ${
              canSubmit && !submitting
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {submitting ? "Submitting..." : "Submit & Continue to Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
































