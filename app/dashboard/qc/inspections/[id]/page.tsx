"use client";

// Block 50000 — SmartSend Roofing QC Inspection System v1
// Supervisor QC Checklist Page
// app/dashboard/qc/inspections/[id]/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  XCircle, 
  Clock,
  Camera,
  Upload,
  Save,
  ArrowLeft,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ChecklistItem {
  key: string;
  label: string;
  status: "pending" | "pass" | "fail";
  requires_photo: boolean;
  weight?: number;
  notes?: string;
  photo_uploaded?: boolean;
}

interface QCInspection {
  id: string;
  job_id: string;
  checklist: ChecklistItem[];
  score: number;
  status: string;
  pass_threshold: number;
  photos_required_count: number;
  photos_uploaded_count: number;
  supervisor_notes?: string;
  overall_notes?: string;
  job: {
    id: string;
    title: string;
    status: string;
  };
  photos: Array<{
    id: string;
    checklist_item: string;
    url: string;
    photo_type: string;
  }>;
  failures: Array<{
    id: string;
    item: string;
    notes: string;
    severity: string;
  }>;
}

export default function QCChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const inspectionId = params.id as string;
  
  const [inspection, setInspection] = useState<QCInspection | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadInspection();
  }, [inspectionId]);

  const loadInspection = async () => {
    const response = await fetch(`/api/qc/inspections/${inspectionId}`);
    if (response.ok) {
      const data = await response.json();
      setInspection(data.inspection);
      setChecklist(data.inspection.checklist || []);
      setNotes(data.inspection.overall_notes || "");
    }
    setLoading(false);
  };

  const updateItemStatus = (itemKey: string, status: "pass" | "fail") => {
    setChecklist(prev => prev.map(item => 
      item.key === itemKey 
        ? { ...item, status }
        : item
    ));
  };

  const updateItemNotes = (itemKey: string, notes: string) => {
    setChecklist(prev => prev.map(item => 
      item.key === itemKey 
        ? { ...item, notes }
        : item
    ));
  };

  const handlePhotoUpload = async (itemKey: string, file: File) => {
    if (!inspection) return;

    setUploadingPhoto(itemKey);
    const supabase = createClient();

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${inspection.job_id}/${itemKey}_${Date.now()}.${fileExt}`;
    const filePath = `qc-photos/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('job-photos') // Adjust bucket name as needed
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      alert("Failed to upload photo");
      setUploadingPhoto(null);
      return;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('job-photos')
      .getPublicUrl(filePath);

    // Create QC photo record
    const photoResponse = await fetch("/api/qc/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qc_inspection_id: inspectionId,
        job_id: inspection.job_id,
        checklist_item: itemKey,
        url: publicUrl,
        photo_type: "other",
      }),
    });

    if (photoResponse.ok) {
      // Mark item as having photo uploaded
      setChecklist(prev => prev.map(item => 
        item.key === itemKey 
          ? { ...item, photo_uploaded: true }
          : item
      ));
      loadInspection(); // Reload to get updated photos
    }

    setUploadingPhoto(null);
  };

  const handleSave = async () => {
    if (!inspection) return;

    setSaving(true);

    // Determine status based on completion
    const hasAllItems = checklist.every(item => item.status !== "pending");
    const newStatus = inspection.status === "pending" && hasAllItems 
      ? "in_review" 
      : inspection.status;

    const response = await fetch(`/api/qc/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist,
        status: newStatus,
        overall_notes: notes,
        photos_uploaded_count: inspection.photos_uploaded_count,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setInspection(data.inspection);
      alert("QC inspection saved successfully!");
    } else {
      alert("Failed to save QC inspection");
    }

    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!inspection) return;

    const allPassed = checklist.every(item => item.status === "pass" || item.status === "fail");
    if (!allPassed) {
      alert("Please mark all items as Pass or Fail before submitting");
      return;
    }

    setSaving(true);

    const response = await fetch(`/api/qc/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist,
        status: "in_review",
        overall_notes: notes,
        photos_uploaded_count: inspection.photos_uploaded_count,
      }),
    });

    if (response.ok) {
      router.push("/dashboard/qc");
    } else {
      alert("Failed to submit QC inspection");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading QC Inspection...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-400">QC Inspection not found</p>
          <Link href="/dashboard/qc" className="text-yellow-500 hover:text-yellow-400 mt-4 inline-block">
            ← Back to QC Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const scoreColor = inspection.score >= inspection.pass_threshold 
    ? "text-green-500" 
    : inspection.score >= inspection.pass_threshold * 0.8
    ? "text-yellow-500"
    : "text-red-500";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href="/dashboard/qc" 
            className="text-yellow-500 hover:text-yellow-400 text-sm mb-4 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to QC Dashboard
          </Link>
          <h1 className="text-3xl font-bold mb-2">{inspection.job?.title || "QC Inspection"}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>Job ID: {inspection.job_id.slice(0, 8)}</span>
            <span>•</span>
            <span className={scoreColor}>
              Score: {inspection.score.toFixed(1)} / 100
            </span>
            <span>•</span>
            <span>Threshold: {inspection.pass_threshold}</span>
          </div>
        </div>

        {/* Score Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">QC Score</p>
              <p className={`text-4xl font-bold ${scoreColor}`}>
                {inspection.score.toFixed(1)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {inspection.score >= inspection.pass_threshold ? "✅ Passed" : "❌ Failed"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm mb-1">Photos</p>
              <p className="text-2xl font-bold">
                {inspection.photos_uploaded_count} / {inspection.photos_required_count}
              </p>
            </div>
          </div>
        </div>

        {/* Checklist Items */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">QC Checklist</h2>
          <div className="space-y-4">
            {checklist.map((item, index) => {
              const itemPhotos = inspection.photos.filter(p => p.checklist_item === item.key);
              const hasPhoto = itemPhotos.length > 0 || item.photo_uploaded;

              return (
                <div 
                  key={item.key || index} 
                  className="border border-gray-700 rounded-lg p-4 bg-gray-800"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{item.label}</h3>
                      {item.requires_photo && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                          <Camera className="w-4 h-4" />
                          <span>Photo required</span>
                          {hasPhoto && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateItemStatus(item.key, "pass")}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          item.status === "pass"
                            ? "bg-green-500/20 border-green-500 text-green-500"
                            : "border-gray-600 text-gray-400 hover:border-green-500"
                        }`}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => updateItemStatus(item.key, "fail")}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          item.status === "fail"
                            ? "bg-red-500/20 border-red-500 text-red-500"
                            : "border-gray-600 text-gray-400 hover:border-red-500"
                        }`}
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    value={item.notes || ""}
                    onChange={(e) => updateItemNotes(item.key, e.target.value)}
                    placeholder="Add notes..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm mb-3"
                    rows={2}
                  />

                  {/* Photo Upload */}
                  {item.requires_photo && (
                    <div className="mt-3">
                      <label className="block text-sm text-gray-400 mb-2">
                        {hasPhoto ? "Photo uploaded" : "Upload photo"}
                      </label>
                      {itemPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {itemPhotos.map(photo => (
                            <img 
                              key={photo.id} 
                              src={photo.url} 
                              alt={item.label}
                              className="w-full h-24 object-cover rounded border border-gray-700"
                            />
                          ))}
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(item.key, file);
                        }}
                        className="hidden"
                        id={`photo-${item.key}`}
                        disabled={uploadingPhoto === item.key}
                      />
                      <label
                        htmlFor={`photo-${item.key}`}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer text-sm"
                      >
                        {uploadingPhoto === item.key ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            {hasPhoto ? "Add Another Photo" : "Upload Photo"}
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Overall Notes */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Overall Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add overall QC notes..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm"
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Submit QC Inspection
          </button>
        </div>

        {/* Failures List */}
        {inspection.failures && inspection.failures.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 mt-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-semibold text-red-500">QC Failures</h2>
            </div>
            <div className="space-y-2">
              {inspection.failures.map(failure => (
                <div key={failure.id} className="bg-gray-800 border border-red-500/30 rounded-lg p-3">
                  <p className="font-medium">{failure.item}</p>
                  {failure.notes && <p className="text-sm text-gray-400 mt-1">{failure.notes}</p>}
                  <span className="text-xs text-red-400 mt-2 inline-block">
                    Severity: {failure.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
































