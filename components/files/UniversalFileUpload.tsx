"use client";

import { useState, useRef } from "react";
import { Upload, Image, FileText, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type UniversalFileUploadProps = {
  contactId: string;
  onUploadComplete?: (file: any) => void;
  variant?: "button" | "icon";
  size?: "sm" | "md" | "lg";
  showCameraOption?: boolean; // For mobile photo intake
  className?: string;
};

export function UniversalFileUpload({
  contactId,
  onUploadComplete,
  variant = "button",
  size = "md",
  showCameraOption = false,
  className = "",
}: UniversalFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Validate file size (10MB for files, 50MB for videos)
    const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
      return;
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "video/mp4",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("File type not allowed");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", contactId);

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await res.json();

      // Trigger analysis for photos (Photo Intelligence v1)
      if (file.type.startsWith("image/")) {
        try {
          // Trigger comprehensive Photo Intelligence analysis
          await fetch("/api/photo/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              contactId: contactId,
              attachmentId: data.id 
            }),
          });
          
          // Also trigger legacy photo analysis for backward compatibility
          await fetch("/api/files/analyze-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attachmentId: data.id }),
          }).catch(() => {
            // Ignore errors from legacy endpoint
          });
        } catch (analysisError) {
          console.error("Photo analysis error:", analysisError);
          // Don't fail the upload if analysis fails
        }
      }

      // Trigger analysis for PDFs
      if (file.type === "application/pdf") {
        try {
          await fetch("/api/files/analyze-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attachmentId: data.id }),
          });
        } catch (analysisError) {
          console.error("PDF analysis error:", analysisError);
          // Don't fail the upload if analysis fails
        }
      }

      if (onUploadComplete) {
        onUploadComplete(data);
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
      setCameraDialogOpen(false);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      alert(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    if (showCameraOption && isMobile()) {
      setCameraDialogOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const isMobile = () => {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  };

  const buttonSizes = {
    sm: "h-8 px-2 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={handleButtonClick}
          disabled={uploading}
          className={`p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 ${className}`}
          title="Upload file"
        >
          {uploading ? (
            <Loader2 className={`${iconSizes[size]} animate-spin`} />
          ) : (
            <Upload className={iconSizes[size]} />
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.docx,.doc,.mp4"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />

        {showCameraOption && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment" // Use back camera on mobile
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Photo</DialogTitle>
                  <DialogDescription>
                    Choose how you want to add a photo
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 mt-4">
                  <Button
                    onClick={() => {
                      cameraInputRef.current?.click();
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setCameraDialogOpen(false);
                    }}
                    className="w-full"
                    variant="outline"
                  >
                    <Image className="h-4 w-4 mr-2" />
                    Choose from Gallery
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={handleButtonClick}
        disabled={uploading}
        size={size}
        className={className}
      >
        {uploading ? (
          <>
            <Loader2 className={`${iconSizes[size]} mr-2 animate-spin`} />
            Uploading...
          </>
        ) : (
          <>
            <Upload className={`${iconSizes[size]} mr-2`} />
            Upload File
          </>
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.docx,.doc,.mp4"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      {showCameraOption && (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Photo</DialogTitle>
                <DialogDescription>
                  Choose how you want to add a photo
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 mt-4">
                <Button
                  onClick={() => {
                    cameraInputRef.current?.click();
                  }}
                  className="w-full"
                  variant="outline"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
                <Button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setCameraDialogOpen(false);
                  }}
                  className="w-full"
                  variant="outline"
                >
                  <Image className="h-4 w-4 mr-2" />
                  Choose from Gallery
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

