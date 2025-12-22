// Block 17000 — Attach From Files Component
// Allows users to attach existing files from contact's file library to inbox messages

"use client";

import { useState, useEffect } from "react";
import { FileText, Image, X, Search, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Attachment = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  folder: string | null;
  created_at: string;
  url: string | null;
};

type AttachFromFilesProps = {
  contactId: string;
  onAttach: (attachmentIds: string[]) => void;
  disabled?: boolean;
};

export function AttachFromFiles({ contactId, onAttach, disabled }: AttachFromFilesProps) {
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFolder, setFilterFolder] = useState<string | null>(null);

  useEffect(() => {
    if (open && contactId) {
      fetchAttachments();
    }
  }, [open, contactId]);

  const fetchAttachments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attachments/contact/${contactId}`);
      if (!res.ok) throw new Error("Failed to fetch attachments");
      const data = await res.json();
      setAttachments(data.attachments || []);
    } catch (error) {
      console.error("Error fetching attachments:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAttachments = attachments.filter((att) => {
    const matchesSearch = searchQuery
      ? att.file_name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesFolder = filterFolder ? att.folder === filterFolder : true;
    return matchesSearch && matchesFolder;
  });

  const folders = Array.from(new Set(attachments.map((a) => a.folder).filter(Boolean)));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAttach = () => {
    onAttach(Array.from(selectedIds));
    setSelectedIds(new Set());
    setOpen(false);
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    if (fileType === "application/pdf") {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    return <FileText className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        📎 Attach from Files
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Attach Files from Contact</DialogTitle>
            <DialogDescription>
              Select files from this contact's file library to attach to your message
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search and Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              {folders.length > 0 && (
                <select
                  value={filterFolder || ""}
                  onChange={(e) => setFilterFolder(e.target.value || null)}
                  className="px-3 py-2 border rounded-md text-sm"
                >
                  <option value="">All Folders</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* File List */}
            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading files...</div>
              ) : filteredAttachments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {attachments.length === 0
                    ? "No files available for this contact"
                    : "No files match your search"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredAttachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => toggleSelection(attachment.id)}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${
                        selectedIds.has(attachment.id) ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(attachment.id)}
                        onChange={() => toggleSelection(attachment.id)}
                        className="h-4 w-4"
                      />
                      {getFileIcon(attachment.file_type)}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(attachment.file_size)}</span>
                          {attachment.folder && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Folder className="h-3 w-3" />
                                {attachment.folder}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedIds.size > 0 && `${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""} selected`}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAttach} disabled={selectedIds.size === 0}>
                  Attach {selectedIds.size > 0 && `(${selectedIds.size})`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}





















































