"use client";

import useSWR from "swr";
import { useState } from "react";
import { DocumentCard } from "./DocumentCard";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface JobDocumentsTabProps {
  jobId: string;
}

export function JobDocumentsTab({ jobId }: JobDocumentsTabProps) {
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/documents`,
    fetcher
  );

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadDocument(formData: FormData) {
    setUploading(true);
    setUploadError(null);

    try {
      const res = await fetch("/api/jobs/upload-document", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadError(json.error || "Upload failed");
        return;
      }

      if (json.success) {
        mutate(); // refresh list
        // Reset form
        const form = document.getElementById(
          "upload-form"
        ) as HTMLFormElement;
        if (form) form.reset();
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error loading documents: {error.message}
      </div>
    );
  }

  const docs = data?.documents || [];

  return (
    <div className="space-y-6 p-4">
      {/* UPLOAD FORM */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4 shadow-sm">
        <p className="font-semibold mb-2 text-zinc-50">Upload Document</p>

        <form
          id="upload-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            uploadDocument(fd);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="job_id" value={jobId} />

          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Document Type
            </label>
            <select
              name="doc_type"
              className="border border-zinc-800 rounded px-2 py-1 w-full text-sm bg-zinc-900 text-zinc-50"
            >
              <option value="photo_before">Before Photo</option>
              <option value="photo_after">After Photo</option>
              <option value="contract">Contract</option>
              <option value="invoice">Invoice</option>
              <option value="insurance">Insurance</option>
              <option value="permit">Permit</option>
              <option value="receipt">Receipt</option>
              <option value="material_list">Material List</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              name="title"
              className="border border-zinc-800 rounded px-2 py-1 w-full text-sm bg-zinc-900 text-zinc-50"
              placeholder="Example: Signed Contract"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">File</label>
            <input
              type="file"
              name="file"
              required
              className="text-sm text-zinc-50 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-50 hover:file:bg-zinc-700"
            />
          </div>

          {uploadError && (
            <p className="text-xs text-red-400">{uploadError}</p>
          )}

          <button
            type="submit"
            className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-50 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      {/* DOCUMENT LIST */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Documents ({docs.length})
        </p>
        {docs.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No documents uploaded yet. Upload your first document above.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {docs.map((doc: any) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}








































