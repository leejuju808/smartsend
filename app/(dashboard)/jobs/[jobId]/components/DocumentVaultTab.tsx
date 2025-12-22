"use client";

import useSWR from "swr";
import { useState, useCallback, useRef } from "react";
import { DocumentCard } from "./DocumentCard";
import { Search, Upload, Folder, FileText, Image, Receipt, FileCheck, Shield, Building2, StickyNote } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DocumentVaultTabProps {
  jobId: string;
}

type FolderType =
  | "estimates"
  | "insurance"
  | "permits"
  | "photos"
  | "receipts"
  | "contracts"
  | "warranty"
  | "notes"
  | "other";

const FOLDER_CONFIG: Record<
  FolderType,
  { label: string; icon: any; color: string }
> = {
  estimates: {
    label: "Estimates & Proposals",
    icon: FileText,
    color: "text-blue-400",
  },
  insurance: {
    label: "Insurance Documents",
    icon: Shield,
    color: "text-green-400",
  },
  permits: {
    label: "Permits & Municipal",
    icon: Building2,
    color: "text-yellow-400",
  },
  photos: {
    label: "Photos & Videos",
    icon: Image,
    color: "text-purple-400",
  },
  receipts: {
    label: "Material Receipts",
    icon: Receipt,
    color: "text-orange-400",
  },
  contracts: {
    label: "Contracts & Signatures",
    icon: FileCheck,
    color: "text-red-400",
  },
  warranty: {
    label: "Warranty & Post-Job",
    icon: Shield,
    color: "text-indigo-400",
  },
  notes: {
    label: "Internal Office Notes",
    icon: StickyNote,
    color: "text-gray-400",
  },
  other: {
    label: "Other",
    icon: Folder,
    color: "text-zinc-400",
  },
};

export function DocumentVaultTab({ jobId }: DocumentVaultTabProps) {
  const [activeFolder, setActiveFolder] = useState<FolderType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/documents-vault${activeFolder !== "all" ? `?folder=${activeFolder}` : ""}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`,
    fetcher
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    []
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      await uploadFiles(files);
    },
    []
  );

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("job_id", jobId);
        formData.append("doc_type", "other"); // Let AI categorize

        const res = await fetch("/api/jobs/upload-document", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Upload failed");
        }
        return json;
      });

      await Promise.all(uploadPromises);
      mutate(); // Refresh list
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [jobId, mutate]);

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error loading documents: {error.message}
      </div>
    );
  }

  const documents = data?.documents || [];
  const groupedByFolder = data?.groupedByFolder || {};

  // Count documents per folder
  const folderCounts: Record<string, number> = {};
  Object.keys(groupedByFolder).forEach((folder) => {
    folderCounts[folder] = groupedByFolder[folder].length;
  });

  return (
    <div className="space-y-6 p-4">
      {/* HEADER WITH SEARCH */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search documents... (claim number, carrier, filename)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading..." : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* FOLDER TABS */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveFolder("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeFolder === "all"
              ? "bg-blue-600 text-white"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          All ({documents.length})
        </button>
        {Object.entries(FOLDER_CONFIG).map(([folder, config]) => {
          const Icon = config.icon;
          const count = folderCounts[folder] || 0;
          return (
            <button
              key={folder}
              onClick={() => setActiveFolder(folder as FolderType)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                activeFolder === folder
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <Icon className={`w-4 h-4 ${config.color}`} />
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* DRAG & DROP ZONE */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-800 bg-zinc-950"
        }`}
      >
        <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <p className="text-sm text-zinc-400 mb-2">
          Drag and drop files here, or click Upload above
        </p>
        <p className="text-xs text-zinc-500">
          SmartSend will automatically categorize your documents
        </p>
      </div>

      {uploadError && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400">
          {uploadError}
        </div>
      )}

      {/* DOCUMENTS BY FOLDER */}
      {activeFolder === "all" ? (
        // Show all folders
        <div className="space-y-8">
          {Object.entries(FOLDER_CONFIG).map(([folder, config]) => {
            const folderDocs = groupedByFolder[folder] || [];
            if (folderDocs.length === 0) return null;

            const Icon = config.icon;
            return (
              <div key={folder} className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                  <Icon className={`w-5 h-5 ${config.color}`} />
                  <h3 className="font-semibold text-zinc-50">
                    {config.label}
                  </h3>
                  <span className="text-xs text-zinc-500">
                    ({folderDocs.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {folderDocs.map((doc: any) => (
                    <DocumentCard key={doc.id} doc={doc} />
                  ))}
                </div>
              </div>
            );
          })}
          {documents.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <Folder className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
              <p className="text-sm">No documents yet</p>
              <p className="text-xs mt-1">
                Upload your first document to get started
              </p>
            </div>
          )}
        </div>
      ) : (
        // Show single folder
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Folder className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
              <p className="text-sm">
                No documents in {FOLDER_CONFIG[activeFolder].label}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {documents.map((doc: any) => (
                <DocumentCard key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

