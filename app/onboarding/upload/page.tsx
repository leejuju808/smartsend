"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function OnboardingUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
        setError("Please select a CSV file");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type !== "text/csv" && !droppedFile.name.endsWith(".csv")) {
        setError("Please select a CSV file");
        return;
      }
      setFile(droppedFile);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      // Redirect to column mapping
      router.push("/onboarding/map-columns");
    } catch (err: any) {
      setError(err.message || "Failed to upload file");
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-10 p-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-center">Upload Homeowners</h1>
        <p className="text-center text-muted-foreground">
          Upload a CSV file with homeowners you want to reach.
        </p>
      </div>

      {/* Upload Box */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileSelect}
        />
        {!file ? (
          <div className="space-y-4">
            <div className="text-4xl">📄</div>
            <div>
              <div className="text-lg font-medium">Drag & drop your CSV file here</div>
              <div className="text-sm text-muted-foreground mt-1">or click to browse</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-4xl">✅</div>
            <div>
              <div className="text-lg font-medium">{file.name}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {formatFileSize(file.size)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="text-center text-sm text-muted-foreground">
        {file ? (
          <span>File selected: {file.name} ({formatFileSize(file.size)})</span>
        ) : (
          <span>No file uploaded</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Continue Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          size="lg"
          className="min-w-[200px]"
        >
          {uploading ? "Uploading..." : "Continue to Column Mapping"}
        </Button>
      </div>
    </div>
  );
}


