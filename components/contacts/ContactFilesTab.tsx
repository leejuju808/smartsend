"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Upload, FileText, Image, File, X, Download, Trash2, Eye, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UniversalFileUpload } from "@/components/files/UniversalFileUpload";
import { SideBySidePhotoViewer } from "@/components/files/SideBySidePhotoViewer";

type Attachment = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  linked_to: string | null;
  folder: string | null;
  ai_label: string | null;
  ai_tags: string[] | null;
  detected_damage_type: string | null;
  created_at: string;
  uploaded_by: { id: string; name: string } | null;
  url: string | null;
};

type Props = {
  contactId: string;
};

export function ContactFilesTab({ contactId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "photos" | "pdfs" | "estimates">("all");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["Roof Photos", "Damage Photos", "Insurance Documents"]));
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [sideBySideViewerOpen, setSideBySideViewerOpen] = useState(false);
  const [sideBySidePhotos, setSideBySidePhotos] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [storageLimitExceeded, setStorageLimitExceeded] = useState<{
    storageUsed: number;
    storageLimit: number;
    planTier: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Organize attachments by folder
  const attachmentsByFolder = useMemo(() => {
    const folders: Record<string, Attachment[]> = {
      "Roof Photos": [],
      "Damage Photos": [],
      "Insurance Documents": [],
      "Job Quotes": [],
      "Before/After": [],
      "Other Files": [],
    };

    attachments.forEach((attachment) => {
      const folder = attachment.folder || "Other Files";
      if (!folders[folder]) {
        folders[folder] = [];
      }
      folders[folder].push(attachment);
    });

    return folders;
  }, [attachments]);

  // Get photos for side-by-side viewer
  const photosForViewer = useMemo(() => {
    return attachments
      .filter((a) => a.file_type.startsWith("image/") && a.url)
      .map((a) => ({
        id: a.id,
        url: a.url!,
        file_name: a.file_name,
        created_at: a.created_at,
        ai_label: a.ai_label || undefined,
        detected_damage_type: a.detected_damage_type || undefined,
      }));
  }, [attachments]);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const filterParam = filter === "all" ? "" : `?filter=${filter}`;
      const res = await fetch(`/api/attachments/contact/${contactId}${filterParam}`);
      
      if (!res.ok) {
        throw new Error("Failed to fetch attachments");
      }

      const data = await res.json();
      setAttachments(data.attachments || []);
    } catch (err: any) {
      console.error("Error fetching attachments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [contactId, filter]);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit");
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
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("File type not allowed");
      return;
    }

    setUploading(true);
    setError(null);

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
        if (errorData.error === "Storage limit exceeded") {
          setStorageLimitExceeded({
            storageUsed: errorData.storageUsed || 0,
            storageLimit: errorData.storageLimit || 1073741824,
            planTier: errorData.planTier || "starter",
          });
          return;
        }
        throw new Error(errorData.error || "Upload failed");
      }

      // Refresh attachments list
      await fetchAttachments();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      console.error("Error uploading file:", err);
      setError(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleOpenSideBySide = (photo: Attachment) => {
    const photoIndex = photosForViewer.findIndex((p) => p.id === photo.id);
    setSideBySidePhotos(photosForViewer);
    setSideBySideViewerOpen(true);
  };

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folder)) {
        newSet.delete(folder);
      } else {
        newSet.add(folder);
      }
      return newSet;
    });
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) {
      return;
    }

    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete attachment");
      }

      // Refresh attachments list
      await fetchAttachments();
    } catch (err: any) {
      console.error("Error deleting attachment:", err);
      setError(err.message || "Failed to delete file");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <Image className="h-5 w-5" />;
    }
    if (fileType === "application/pdf") {
      return <FileText className="h-5 w-5" />;
    }
    return <File className="h-5 w-5" />;
  };

  const isImage = (fileType: string) => fileType.startsWith("image/");
  const isPdf = (fileType: string) => fileType === "application/pdf";

  if (loading && attachments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading files...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UniversalFileUpload
            contactId={contactId}
            onUploadComplete={() => fetchAttachments()}
            showCameraOption={true}
            size="sm"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "photos" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("photos")}
          >
            Photos
          </Button>
          <Button
            variant={filter === "pdfs" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("pdfs")}
          >
            PDFs
          </Button>
          <Button
            variant={filter === "estimates" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("estimates")}
          >
            Estimates
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-800">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Files Organized by Folder */}
      {attachments.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No files uploaded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload photos, PDFs, estimates, and other job documents
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(attachmentsByFolder).map(([folder, folderAttachments]) => {
            if (folderAttachments.length === 0) return null;

            const isExpanded = expandedFolders.has(folder);

            return (
              <div key={folder} className="border rounded-lg">
                <button
                  onClick={() => toggleFolder(folder)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <FolderOpen className="h-5 w-5 text-blue-500" />
                    ) : (
                      <Folder className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="font-medium">{folder}</span>
                    <span className="text-sm text-muted-foreground">
                      ({folderAttachments.length})
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                    {folderAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getFileIcon(attachment.file_type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" title={attachment.file_name}>
                                {attachment.file_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(attachment.file_size)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {isImage(attachment.file_type) && (
                              <>
                                <button
                                  onClick={() => handleOpenSideBySide(attachment)}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  title="View Side-by-Side"
                                >
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => setPreviewAttachment(attachment)}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  title="Preview"
                                >
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </button>
                              </>
                            )}
                            {(isImage(attachment.file_type) || isPdf(attachment.file_type)) && !isImage(attachment.file_type) && (
                              <button
                                onClick={() => setPreviewAttachment(attachment)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Preview"
                              >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </button>
                            )}
                            {attachment.url && (
                              <a
                                href={attachment.url}
                                download={attachment.file_name}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Download"
                              >
                                <Download className="h-4 w-4 text-muted-foreground" />
                              </a>
                            )}
                            <button
                              onClick={() => handleDelete(attachment.id)}
                              className="p-1 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Added by {attachment.uploaded_by?.name || "Unknown"} on {formatDate(attachment.created_at)}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {attachment.ai_label && (
                              <span className="inline-block px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                                {attachment.ai_label}
                              </span>
                            )}
                            {attachment.detected_damage_type && (
                              <span className="inline-block px-2 py-0.5 text-xs bg-orange-50 text-orange-700 rounded">
                                {attachment.detected_damage_type}
                              </span>
                            )}
                            {attachment.linked_to && (
                              <span className="inline-block px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded">
                                {attachment.linked_to}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Side-by-Side Photo Viewer */}
      <SideBySidePhotoViewer
        photos={sideBySidePhotos}
        open={sideBySideViewerOpen}
        onClose={() => setSideBySideViewerOpen(false)}
      />

      {/* Preview Modal */}
      {previewAttachment && (
        <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{previewAttachment.file_name}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 overflow-auto max-h-[70vh]">
              {isImage(previewAttachment.file_type) && previewAttachment.url && (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.file_name}
                  className="max-w-full h-auto mx-auto"
                />
              )}
              {isPdf(previewAttachment.file_type) && previewAttachment.url && (
                <iframe
                  src={previewAttachment.url}
                  className="w-full h-[70vh] border rounded"
                  title={previewAttachment.file_name}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Storage Limit Exceeded Modal */}
      {storageLimitExceeded && (
        <Dialog open={!!storageLimitExceeded} onOpenChange={() => setStorageLimitExceeded(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Storage Limit Exceeded</DialogTitle>
              <DialogDescription>
                You've reached your storage limit. Upgrade your plan to upload more files.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Storage Used:</span>
                  <span className="font-medium">
                    {(storageLimitExceeded.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Storage Limit:</span>
                  <span className="font-medium">
                    {(storageLimitExceeded.storageLimit / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Plan:</span>
                  <span className="font-medium capitalize">{storageLimitExceeded.planTier}</span>
                </div>
              </div>
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <p className="text-sm text-blue-900">
                  <strong>Upgrade to get more storage:</strong>
                </p>
                <ul className="text-xs text-blue-800 mt-2 space-y-1 list-disc list-inside">
                  <li>Growth Plan: 5GB storage</li>
                  <li>Domination Plan: 20GB storage</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStorageLimitExceeded(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  window.location.href = "/settings/billing";
                }}
              >
                Upgrade Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

