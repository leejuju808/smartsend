// Block 26940 — SmartSend Roofing Field Photo & Document Intelligence v1
// UI Page: Field Photos with AI Labels
// app/jobs/[id]/photos/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

interface Photo {
  id: string;
  job_id: string;
  storage_path: string;
  category: string | null;
  damage_labels: string[] | null;
  ai_summary: string | null;
  created_at: string;
  url?: string;
}

export default function JobPhotosPage() {
  const params = useParams();
  const job_id = params.jobId as string;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [job_id]);

  async function loadPhotos() {
    try {
      const response = await fetch(`/api/job/${job_id}/photos`);
      if (!response.ok) {
        throw new Error("Failed to load photos");
      }

      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error("Error loading photos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/job/${job_id}/upload-photo`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Failed to upload photo");
        }
      }

      // Reload photos after upload
      await loadPhotos();
    } catch (error) {
      console.error("Error uploading photos:", error);
      alert("Failed to upload photos. Please try again.");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  }

  async function handleGeneratePDF() {
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/job/${job_id}/generate-pdf`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-report-${job_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingSummary(false);
    }
  }

  async function handleGenerateSummary() {
    setGeneratingSummary(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate_inspection_summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ job_id }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      alert("Inspection summary generated successfully!");
    } catch (error) {
      console.error("Error generating summary:", error);
      alert("Failed to generate summary. Please try again.");
    } finally {
      setGeneratingSummary(false);
    }
  }

  // Group photos by category
  const photosByCategory: Record<string, Photo[]> = {};
  photos.forEach((photo) => {
    const category = photo.category || "uncategorized";
    if (!photosByCategory[category]) {
      photosByCategory[category] = [];
    }
    photosByCategory[category].push(photo);
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading photos...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Field Photos</h1>
          <p className="text-sm text-zinc-400 mt-1">
            AI-organized photos with automatic damage detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="px-4 py-2 bg-zinc-800 text-white rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
            {uploading ? "Uploading..." : "Upload Photos"}
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <button
            onClick={handleGenerateSummary}
            disabled={generatingSummary || photos.length < 10}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingSummary ? "Generating..." : "Generate Summary"}
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={generatingSummary}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-zinc-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingSummary ? "Generating..." : "Generate PDF"}
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-sm text-zinc-400">
            No photos uploaded yet. Upload photos to get AI-powered analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(photosByCategory).map(([category, categoryPhotos]) => (
            <div key={category} className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-50 capitalize">
                {category.replace(/_/g, " ")} ({categoryPhotos.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {categoryPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors"
                  >
                    {photo.url && (
                      <div className="relative aspect-square w-full">
                        <Image
                          src={photo.url}
                          alt={photo.category || "Photo"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 25vw"
                        />
                      </div>
                    )}
                    <div className="p-3 space-y-2">
                      {photo.category && (
                        <div className="text-xs font-semibold text-zinc-300 capitalize">
                          {photo.category.replace(/_/g, " ")}
                        </div>
                      )}
                      {photo.damage_labels && photo.damage_labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {photo.damage_labels.map((label, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-2 py-0.5 bg-red-900/30 text-red-300 rounded"
                            >
                              {label.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                      {photo.ai_summary && (
                        <div className="text-[10px] text-zinc-500 line-clamp-2">
                          {photo.ai_summary}
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-600">
                        {new Date(photo.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



































