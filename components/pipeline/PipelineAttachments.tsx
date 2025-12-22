"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, FileText, Image, Download, Trash2, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Attachment = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  linked_to: string | null;
  created_at: string;
  uploaded_by: { id: string; name: string } | null;
  url: string | null;
};

type Props = {
  contactId: string;
  linkedTo?: string | null; // 'inspection', 'estimate', 'job_won', etc.
};

export function PipelineAttachments({ contactId, linkedTo }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const filterParam = linkedTo ? `?filter=${linkedTo === "estimate" ? "estimates" : "all"}` : "";
      const res = await fetch(`/api/attachments/contact/${contactId}${filterParam}`);
      
      if (!res.ok) {
        throw new Error("Failed to fetch attachments");
      }

      const data = await res.json();
      // Filter by linkedTo if provided
      const filtered = linkedTo
        ? (data.attachments || []).filter((a: Attachment) => a.linked_to === linkedTo)
        : data.attachments || [];
      setAttachments(filtered);
    } catch (err: any) {
      console.error("Error fetching attachments:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [contactId, linkedTo]);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit");
      return;
    }

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
      if (linkedTo) {
        formData.append("linkedTo", linkedTo);
      }

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      await fetchAttachments();
      
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

  const isImage = (fileType: string) => fileType.startsWith("image/");
  const isPdf = (fileType: string) => fileType === "application/pdf";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-300">
          {linkedTo === "inspection" && "Inspection Attachments"}
          {linkedTo === "estimate" && "Estimate Attachments"}
          {linkedTo === "job_won" && "Job Documents"}
          {!linkedTo && "Attachments"}
        </h4>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.docx,.doc"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Upload"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-900/20 border border-red-800 p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-400">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-zinc-500">Loading...</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-zinc-500">No files uploaded yet</div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isImage(attachment.file_type) ? (
                  <Image className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate" title={attachment.file_name}>
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-zinc-500">{formatFileSize(attachment.file_size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(isImage(attachment.file_type) || isPdf(attachment.file_type)) && (
                  <button
                    onClick={() => setPreviewAttachment(attachment)}
                    className="p-1 hover:bg-zinc-800 rounded"
                    title="Preview"
                  >
                    <Eye className="h-3 w-3 text-zinc-400" />
                  </button>
                )}
                {attachment.url && (
                  <a
                    href={attachment.url}
                    download={attachment.file_name}
                    className="p-1 hover:bg-zinc-800 rounded"
                    title="Download"
                  >
                    <Download className="h-3 w-3 text-zinc-400" />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(attachment.id)}
                  className="p-1 hover:bg-red-900/20 rounded"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewAttachment && (
        <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] bg-zinc-950 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{previewAttachment.file_name}</DialogTitle>
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
                  className="w-full h-[70vh] border border-zinc-800 rounded"
                  title={previewAttachment.file_name}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}



























































