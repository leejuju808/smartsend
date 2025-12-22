"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Photo Upload Page for Job
// app/crew/job/[jobId]/photos/page.tsx

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, ArrowLeft, Upload, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { offlineStorage, syncQueuedActions } from "@/lib/offline-storage";
import { OfflineIndicator } from "@/components/OfflineIndicator";

export default function JobPhotosPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [memberId, setMemberId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("during");
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { value: "before", label: "Before" },
    { value: "during", label: "During" },
    { value: "after", label: "After" },
    { value: "issue", label: "Issue" },
  ];

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

    setUploading(true);

    try {
      const isOnline = await offlineStorage.isOnline();
      
      if (isOnline) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("job_id", jobId);
        formData.append("member_id", memberId);
        formData.append("category", selectedCategory);

        const response = await fetch("/api/crew/photos/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (data.success) {
          setPhotos((prev) => [data.photo, ...prev]);
          alert("Photo uploaded successfully!");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        } else {
          alert("Failed to upload photo: " + (data.error || "Unknown error"));
        }
      } else {
        // Cache photo and queue for upload
        await offlineStorage.cachePhoto({
          job_id: jobId,
          category: selectedCategory,
          file,
          member_id: memberId,
        });
        
        await offlineStorage.queueAction({
          type: 'photo',
          endpoint: '/api/crew/photos/upload',
          method: 'POST',
          payload: {
            file,
            job_id: jobId,
            member_id: memberId,
            category: selectedCategory,
          },
        });
        
        alert("Photo saved (offline). Will upload when online.");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setUploading(false);
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
          <h1 className="text-xl font-semibold">Job Photos</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Category Selector */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Photo Category
          </label>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Button */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
            id="photo-upload"
            disabled={uploading}
          />
          <label
            htmlFor="photo-upload"
            className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg font-medium transition-colors ${
              uploading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            }`}
          >
            {uploading ? (
              <>
                <Upload className="w-5 h-5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                Take/Upload Photo
              </>
            )}
          </label>
        </div>

        {/* Photos List */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Uploaded Photos</h2>
          {photos.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No photos uploaded yet
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="relative">
                  <img
                    src={photo.url}
                    alt={photo.category}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                    {photo.category}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <OfflineIndicator />
    </div>
  );
}































