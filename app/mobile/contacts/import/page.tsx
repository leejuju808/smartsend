"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Upload, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Feature B — Quick Contacts Import
 * Take a picture of a business card → SmartSend extracts email & phone → Adds to list
 */
export default function MobileContactsImportPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get workspace
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Upload image
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspace_id", workspace.workspace_id);

      const res = await fetch("/api/mobile/contacts/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to process business card");
        return;
      }

      setExtractedData(data.extracted);
      alert("Contact imported! Email: " + data.extracted.email + ", Phone: " + data.extracted.phone);
      router.push("/mobile/inbox");
    } catch (error) {
      console.error("Error uploading:", error);
      alert("Failed to upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/mobile")}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Import Contact</h1>
            <p className="text-xs text-gray-600">Scan business card</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-blue-900 mb-2">
            How it works:
          </div>
          <div className="text-xs text-blue-800 space-y-1">
            <li>Take a photo of a business card</li>
            <li>SmartSend extracts email & phone</li>
            <li>Contact is added to your list</li>
            <li>Ready to add to campaigns</li>
          </div>
        </div>

        {/* File Input */}
        <div className="bg-white rounded-xl p-6 border-2 border-dashed border-gray-300">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="max-w-full h-64 object-contain rounded-lg mb-4"
              />
            ) : (
              <>
                <Camera className="h-12 w-12 text-gray-400 mb-3" />
                <div className="text-sm font-semibold text-gray-700 mb-1">
                  Tap to take photo
                </div>
                <div className="text-xs text-gray-500">
                  or select from gallery
                </div>
              </>
            )}
          </label>
        </div>

        {/* Extracted Data Preview */}
        {extractedData && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm font-semibold text-green-900 mb-2">
              Extracted Information:
            </div>
            <div className="text-xs text-green-800 space-y-1">
              <div>Email: {extractedData.email || "Not found"}</div>
              <div>Phone: {extractedData.phone || "Not found"}</div>
              <div>Name: {extractedData.name || "Not found"}</div>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-blue-500 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Import Contact
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

