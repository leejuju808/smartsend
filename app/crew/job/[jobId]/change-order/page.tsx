"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Change Order Page for Job
// app/crew/job/[jobId]/change-order/page.tsx

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Camera, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function JobChangeOrderPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [memberId, setMemberId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    suggested_price: "",
  });
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadMember() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: member } = await supabase
        .from("crew_members")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (member) {
        setMemberId(member.id);
      }
    }

    loadMember();
  }, [router]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !memberId) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("job_id", jobId);
      formData.append("member_id", memberId);
      formData.append("category", "issue");

      const response = await fetch("/api/crew/photos/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setPhotoId(data.photo.id);
        setPhotoUrl(data.photo.url);
        alert("Photo uploaded successfully!");
      } else {
        alert("Failed to upload photo: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo. Please try again.");
    }
  };

  const handleSubmit = async () => {
    if (!memberId || !formData.description.trim()) {
      alert("Please provide a description");
      return;
    }

    try {
      const response = await fetch("/api/crew/change-orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          member_id: memberId,
          description: formData.description,
          photo_id: photoId,
          suggested_price: formData.suggested_price || null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Change order submitted successfully!");
        router.back();
      } else {
        alert("Failed to create change order: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error creating change order:", error);
      alert("Failed to create change order. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Create Change Order</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Description */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={5}
            placeholder="Describe the issue (e.g., Unexpected plywood damage, rot, extra layers, decking issues, ventilation upgrades needed...)"
          />
        </div>

        {/* Photo Upload */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photo (Optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
            id="change-order-photo"
          />
          <label
            htmlFor="change-order-photo"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors"
          >
            <Camera className="w-5 h-5 text-gray-400" />
            <span className="text-gray-600">
              {photoUrl ? "Photo uploaded" : "Take/Upload Photo"}
            </span>
          </label>
          {photoUrl && (
            <img
              src={photoUrl}
              alt="Change order"
              className="mt-2 w-full h-48 object-cover rounded-lg"
            />
          )}
        </div>

        {/* Suggested Price */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Suggested Price (Optional)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              value={formData.suggested_price}
              onChange={(e) =>
                setFormData({ ...formData, suggested_price: e.target.value })
              }
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Send className="w-5 h-5" />
          Submit Change Order
        </button>
      </div>
    </div>
  );
}































