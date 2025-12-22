"use client";

// Block 251800 — SmartSend Material Verification System v1
// Crew Delivery Verification Page

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Camera, Upload, X, Check } from "lucide-react";

interface DeliveryRecord {
  id: string;
  job_id: string;
  supplier: string;
  photo_url: string;
  notes: string;
  delivered_at: string;
}

export default function DeliveryVerificationPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingRecords, setExistingRecords] = useState<DeliveryRecord[]>([]);

  useEffect(() => {
    loadExistingRecords();
  }, [jobId]);

  const loadExistingRecords = async () => {
    try {
      const response = await fetch(`/api/materials/delivery?job_id=${jobId}`);
      const data = await response.json();
      if (data.records) {
        setExistingRecords(data.records);
      }
    } catch (error) {
      console.error("Error loading delivery records:", error);
    }
  };

  const handlePhotoCapture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment"; // Use back camera on mobile
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("job_id", jobId);
        formData.append("photo_type", "delivery");

        const response = await fetch("/api/materials/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (data.url) {
          setPhotos([...photos, data.url]);
        } else {
          alert("Failed to upload photo");
        }
      } catch (error) {
        console.error("Error uploading photo:", error);
        alert("Failed to upload photo");
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (photos.length === 0) {
      alert("Please take at least one delivery photo");
      return;
    }

    setSubmitting(true);
    try {
      // Get employee ID from session (if available)
      const session = JSON.parse(localStorage.getItem("crewSession") || "{}");
      const employeeId = session.employee?.id || null;

      const response = await fetch("/api/materials/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          supplier: supplier || null,
          employee_id: employeeId,
          photo_url: photos[0], // Store first photo URL (can be extended to store multiple)
          notes: notes || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit delivery record");
      }

      alert("Delivery verification submitted successfully!");
      router.back();
    } catch (error: any) {
      alert(error.message || "Failed to submit delivery record");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4">
        <button onClick={() => router.back()} className="text-white mb-2">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Delivery Verification</h1>
        <p className="text-sm text-orange-100 mt-1">
          Take photos of materials before unloading
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* Supplier Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Supplier (Optional)
          </label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            placeholder="ABC, SRS, Beacon, etc."
          />
        </div>

        {/* Photo Capture */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Delivery Photos *
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Take photos of: Before unloading, pallets, shingle labels, accessories
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {photos.map((photo, index) => (
              <div key={index} className="relative">
                <img
                  src={photo}
                  alt={`Delivery photo ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <button
                onClick={handlePhotoCapture}
                disabled={loading}
                className="h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-orange-500 hover:text-orange-500"
              >
                <Camera size={32} />
                <span className="text-xs mt-1">Add Photo</span>
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            rows={3}
            placeholder="Any notes about the delivery..."
          />
        </div>

        {/* Existing Records */}
        {existingRecords.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Previous Delivery Records
            </h3>
            <div className="space-y-2">
              {existingRecords.map((record) => (
                <div
                  key={record.id}
                  className="bg-white border border-gray-200 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">
                        {record.supplier || "Unknown Supplier"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(record.delivered_at).toLocaleString()}
                      </p>
                    </div>
                    {record.photo_url && (
                      <img
                        src={record.photo_url}
                        alt="Delivery photo"
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submitting || photos.length === 0}
          className="w-full bg-orange-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Delivery Verification"}
        </button>
      </div>
    </div>
  );
}
























