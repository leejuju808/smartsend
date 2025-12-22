"use client";

// Block 251700 — SmartSend Crew Issue Reporting System v1
// Mobile page: Report Issue
// app/crew/jobs/[jobId]/issue/new/page.tsx

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Camera, AlertTriangle, MapPin } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const ISSUE_TYPES = [
  { value: "material", label: "Material Shortage" },
  { value: "safety", label: "Safety Alert" },
  { value: "damage", label: "Damage Report" },
  { value: "customer", label: "Customer Complaint" },
  { value: "weather", label: "Weather Issue" },
  { value: "other", label: "Other" },
];

const SEVERITY_LEVELS = [
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-800" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
];

export default function ReportIssuePage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [issueType, setIssueType] = useState("material");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Get employee ID from session/localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("crewSession");
      if (session) {
        try {
          const sessionData = JSON.parse(session);
          setEmployeeId(sessionData.crew?.id || sessionData.employee_id || null);
        } catch (e) {
          console.error("Error parsing crew session:", e);
        }
      }
    }
  }, []);

  // Get GPS location
  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.error("Error getting location:", err);
        }
      );
    }
  };

  // Auto-get location on mount
  useEffect(() => {
    getLocation();
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const fileExt = file.name.split(".").pop();
      const fileName = `${jobId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storagePath = `issue-photos/${fileName}`;

      // Convert file to array buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("issue-photos")
        .upload(storagePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading photo:", uploadError);
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("issue-photos")
        .getPublicUrl(storagePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading photo:", error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert("Please enter a title");
      return;
    }

    setSubmitting(true);

    try {
      // Upload photo if selected
      let photoUrl: string | null = null;
      if (photo) {
        photoUrl = await uploadPhoto(photo);
      }

      // Submit issue
      const response = await fetch("/api/workforce/issues/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          employee_id: employeeId,
          issue_type: issueType,
          severity,
          title: title.trim(),
          description: description.trim() || null,
          photo_url: photoUrl,
          location_lat: location?.lat || null,
          location_lng: location?.lng || null,
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Error: ${data.error}`);
        return;
      }

      alert("Issue reported successfully!");
      router.back();
    } catch (error) {
      console.error("Error submitting issue:", error);
      alert("Failed to report issue. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Report Issue</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Issue Type */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Issue Type
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severity
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SEVERITY_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setSeverity(level.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    severity === level.value
                      ? `${level.color} border-2 border-current`
                      : "bg-gray-50 text-gray-700 border border-gray-200"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide more details about the issue..."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Photo Upload */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photo (Optional)
            </label>
            {photoPreview ? (
              <div className="space-y-2">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoPreview(null);
                  }}
                  className="text-sm text-red-600"
                >
                  Remove Photo
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-gray-400 transition-colors">
                <Camera className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">Tap to add photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* GPS Location */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Location
              </label>
              <button
                type="button"
                onClick={getLocation}
                className="text-sm text-blue-600 flex items-center gap-1"
              >
                <MapPin className="w-4 h-4" />
                Update
              </button>
            </div>
            {location ? (
              <div className="text-xs text-gray-500">
                Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
              </div>
            ) : (
              <div className="text-xs text-gray-400">Location not available</div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 text-white rounded-xl py-3 px-4 font-medium flex items-center justify-center gap-2 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5" />
                <span>Report Issue</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
























