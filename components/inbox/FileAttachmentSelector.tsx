"use client";

import { useState, useEffect } from "react";
import { Paperclip, X, FileText, Image, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type FileAttachment = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  url: string | null;
};

type FileAttachmentSelectorProps = {
  contactId: string;
  onFilesSelected: (files: FileAttachment[]) => void;
  selectedFiles?: FileAttachment[];
};

export function FileAttachmentSelector({
  contactId,
  onFilesSelected,
  selectedFiles = [],
}: FileAttachmentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedFiles.map((f) => f.id))
  );

  useEffect(() => {
    if (open) {
      loadFiles();
    }
  }, [open, contactId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attachments/contact/${contactId}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableFiles(data.attachments || []);
      }
    } catch (error) {
      console.error("Error loading files:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (file: FileAttachment) => {
    const newSelected = new Set(selected);
    if (newSelected.has(file.id)) {
      newSelected.delete(file.id);
    } else {
      newSelected.add(file.id);
    }
    setSelected(newSelected);
  };

  const handleAttach = () => {
    const filesToAttach = availableFiles.filter((f) => selected.has(f.id));
    onFilesSelected(filesToAttach);
    setOpen(false);
  };

  const handleRemove = (fileId: string) => {
    const newSelected = new Set(selected);
    newSelected.delete(fileId);
    setSelected(newSelected);
    const remainingFiles = availableFiles.filter((f) => newSelected.has(f.id));
    onFilesSelected(remainingFiles);
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <Image className="h-4 w-4" />;
    }
    if (fileType === "application/pdf") {
      return <FileText className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
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
        className="gap-2"
      >
        <Paperclip className="h-4 w-4" />
        Attach from Files
        {selectedFiles.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
            {selectedFiles.length}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Attach Files</DialogTitle>
            <DialogDescription>
              Select files from this contact's file library to attach to your message
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading files...
            </div>
          ) : availableFiles.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No files available</p>
            </div>
          ) : (
            <>
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {availableFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selected.has(file.id)
                        ? "bg-blue-50 border-blue-300"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() => toggleFile(file)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={() => toggleFile(file)}
                      className="w-4 h-4"
                    />
                    {getFileIcon(file.file_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAttach}>
                  Attach {selected.size} File{selected.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Show selected files */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded text-sm"
            >
              {getFileIcon(file.file_type)}
              <span className="text-xs truncate max-w-[150px]">{file.file_name}</span>
              <button
                type="button"
                onClick={() => handleRemove(file.id)}
                className="text-muted-foreground hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}





















































